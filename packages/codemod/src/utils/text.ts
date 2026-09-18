import { ts, type SourceFile } from "ts-morph"

/* Rewrites the text of every comment and string-like literal in a file (string
literals, template literal chunks, JSX text) through a mapping function, leaving code
untouched. Module specifiers of import and export declarations are skipped, since
those are better handled structurally. Returns whether the file changed. */
export function mapCommentsAndStrings(file: SourceFile, map: (text: string) => string): boolean {
  const source = file.compilerNode
  const text = source.getFullText()
  const ranges = new Map<number, number>()

  const visit = (node: ts.Node): void => {
    // jsdoc is already covered by the comment ranges of the node that owns it
    if (ts.isJSDoc(node)) return
    for (const range of ts.getLeadingCommentRanges(text, node.pos) ?? []) ranges.set(range.pos, range.end)
    for (const range of ts.getTrailingCommentRanges(text, node.end) ?? []) ranges.set(range.pos, range.end)
    if (isStringLike(node) && !isModuleSpecifier(node)) {
      ranges.set(ts.isJsxText(node) ? node.pos : node.getStart(source), node.end)
    }
    for (const child of node.getChildren(source)) visit(child)
  }
  visit(source)

  let result = ""
  let cursor = 0
  for (const [start, end] of [...ranges].sort(([a], [b]) => a - b)) {
    if (start < cursor) continue
    result += text.slice(cursor, start) + map(text.slice(start, end))
    cursor = end
  }
  result += text.slice(cursor)

  if (result === text) return false
  file.replaceWithText(result)
  return true
}

/* Expands a word rename into the casings it is likely to appear in: as given,
PascalCase, UPPERCASE, lowercase and camelCase, each paired with the same casing of
the new word (`CGroup` -> `VGroup` also gives `cGroup` -> `vGroup`, `CGROUP` -> `VGROUP`,
`cgroup` -> `vgroup`). Leading acronyms are camelCased as `XYz` -> `xYz`. */
export function getCaseVariants(from: string, to: string): [string, string][] {
  const casings = [
    (word: string) => word,
    (word: string) => word.charAt(0).toUpperCase() + word.slice(1),
    (word: string) => word.toUpperCase(),
    (word: string) => word.toLowerCase(),
    toCamelCase,
  ]
  const variants = new Map<string, string>()
  for (const casing of casings) {
    const key = casing(from)
    if (!variants.has(key)) variants.set(key, casing(to))
  }
  return [...variants]
}

/* Builds a function that replaces whole-word occurrences of each `from` with its `to`
in a single pass, so replacements never feed into each other. A word starting with an
uppercase letter may sit inside a camelCase word (`myCobject`) and is only blocked by
an uppercase letter in front; any other word must not follow a letter. Longer words win
over shorter ones, and the first pair given for a word wins over later ones. */
export function createWordReplacer(pairs: [from: string, to: string][]): (text: string) => string {
  const words = new Map<string, string>()
  for (const [from, to] of pairs) {
    if (from && from !== to && !words.has(from)) words.set(from, to)
  }
  if (!words.size) return text => text

  const alternatives = [...words.keys()]
    .sort((a, b) => b.length - a.length)
    .map(word => `${/^[A-Z]/.test(word) ? "(?<![A-Z])" : "(?<![A-Za-z])"}${escapeRegExp(word)}`)
  const pattern = new RegExp(alternatives.join("|"), "g")
  return text => text.replace(pattern, match => words.get(match) ?? match)
}

function toCamelCase(word: string): string {
  const run = /^[A-Z]+/.exec(word)?.[0] ?? ""
  if (!run) return word
  // keep the last capital of an acronym when it starts the next word: CGroup -> cGroup
  const keep = run.length > 1 && /[a-z]/.test(word.charAt(run.length)) ? 1 : 0
  return run.slice(0, run.length - keep).toLowerCase() + word.slice(run.length - keep)
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function isStringLike(node: ts.Node): boolean {
  return ts.isStringLiteral(node)
    || ts.isNoSubstitutionTemplateLiteral(node)
    || ts.isTemplateHead(node)
    || ts.isTemplateMiddle(node)
    || ts.isTemplateTail(node)
    || ts.isJsxText(node)
}

function isModuleSpecifier(node: ts.Node): boolean {
  const parent = node.parent
  return !!parent && (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent)) && parent.moduleSpecifier === node
}
