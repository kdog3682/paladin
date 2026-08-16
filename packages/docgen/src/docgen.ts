import { dirname, relative, resolve as resolvePath, sep } from "node:path"
import { collectFiles } from "@paladin/utils"
import { fancyFileTree } from "./fancyFileTree"
import { createStore, DEFAULT_EXTENSIONS, exportsOf, isDirectory, isFile, prime } from "./resolve"
import { createIndex, resolveRef, typeRefs, unique } from "./typerefs"
import { docComment, renderDeclaration } from "./render"
import type { DocEntry, DocgenOptions, DocgenResult, ExcludePreset, Store } from "./docgen.types"
import type { SymbolDoc } from "./parse.types"

const DEFAULT_PRESETS: ExcludePreset[] = ["demo", "script", "test"]
const SOURCE_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx"]

const KIND_ORDER: Record<SymbolDoc["kind"], number> = {
  enum: 0,
  interface: 1,
  type: 2,
  class: 3,
  function: 4,
  const: 5,
  variable: 6,
}

function isSource(path: string): boolean {
  if (path.endsWith(".d.ts")) return false
  return SOURCE_EXTENSIONS.some((ext) => path.endsWith(ext))
}

function expandInputs(input: string | string[], presets: ExcludePreset[]): string[] {
  const inputs = Array.isArray(input) ? input : [input]
  const files: string[] = []
  for (const raw of inputs) {
    const abs = resolvePath(raw)
    if (isDirectory(abs)) {
      const found = collectFiles(abs, { exclude: { presets } })
      for (const file of found) {
        const path = resolvePath(abs, file)
        if (isSource(path)) files.push(path)
      }
      continue
    }
    if (isFile(abs)) files.push(abs)
  }
  return unique(files)
}

function commonRoot(files: string[]): string {
  const first = files[0]
  if (!first) return process.cwd()
  let parts = dirname(first).split(sep)
  for (const file of files.slice(1)) {
    const other = dirname(file).split(sep)
    let i = 0
    while (i < parts.length && i < other.length && parts[i] === other[i]) i++
    parts = parts.slice(0, i)
  }
  return parts.join(sep) || sep
}

function display(file: string, root: string): string {
  const rel = relative(root, file)
  return (rel || file).split(sep).join("/")
}

function keyOf(file: string, symbol: SymbolDoc): string {
  return `${file}#${symbol.name}#${symbol.loc.line}`
}

function addEntry(entries: Map<string, DocEntry>, next: DocEntry): DocEntry {
  const key = keyOf(next.file, next.symbol)
  const existing = entries.get(key)
  if (!existing) {
    entries.set(key, next)
    return next
  }
  // Same declaration reached a second way: keep one record, remember the extra name.
  if (next.exposedAs !== existing.exposedAs && !existing.aliases.includes(next.exposedAs)) {
    existing.aliases.push(next.exposedAs)
  }
  if (existing.reason === "type-ref" && next.reason === "export") existing.reason = "export"
  return existing
}

/** Walk params/returns (and, when transitive, their types too) pulling in declarations. */
function expandTypes(store: Store, entries: Map<string, DocEntry>, options: DocgenOptions): void {
  const index = createIndex(store)
  const limit = options.transitive === false ? 1 : options.maxDepth ?? 8
  const queue: Array<{ entry: DocEntry; depth: number }> = [...entries.values()].map((entry) => ({
    entry,
    depth: 0,
  }))

  let cursor = 0
  while (cursor < queue.length) {
    const item = queue[cursor]
    cursor += 1
    if (!item || item.depth >= limit) continue
    for (const name of typeRefs(item.entry.symbol)) {
      const decl = resolveRef(store, index, item.entry.file, name)
      if (!decl) continue
      const key = keyOf(decl.file, decl.symbol)
      const known = entries.get(key)
      if (known) {
        if (known !== item.entry) known.references += 1
        continue
      }
      const entry = addEntry(entries, {
        file: decl.file,
        symbol: decl.symbol,
        exposedAs: decl.symbol.exportedAs ?? decl.symbol.name,
        aliases: [],
        duplicates: [],
        references: 1,
        reason: "type-ref",
      })
      queue.push({ entry, depth: item.depth + 1 })
    }
  }
}

function preferenceOf(file: string): [number, number, string] {
  const base = file.split(sep).pop() ?? file
  const isIndex = /^index\.[cm]?[jt]sx?$/.test(base) ? 1 : 0
  return [isIndex, file.split(sep).length, file]
}

/** Fold byte-identical declarations of the same name that live in several files. */
function dedupe(entries: DocEntry[], bodies: Map<DocEntry, string>): DocEntry[] {
  const groups = new Map<string, DocEntry[]>()
  for (const entry of entries) {
    const key = `${entry.exposedAs}\u0000${bodies.get(entry) ?? ""}`
    const bucket = groups.get(key)
    if (bucket) bucket.push(entry)
    else groups.set(key, [entry])
  }

  const kept: DocEntry[] = []
  for (const bucket of groups.values()) {
    // Most-referenced wins: that is the copy the rest of the tree actually imports.
    const sorted = [...bucket].sort((a, b) => {
      const [ai, al, ap] = preferenceOf(a.file)
      const [bi, bl, bp] = preferenceOf(b.file)
      return b.references - a.references || ai - bi || al - bl || ap.localeCompare(bp)
    })
    const winner = sorted[0]
    if (!winner) continue
    for (const loser of sorted.slice(1)) {
      winner.duplicates.push(loser.file)
      winner.references += loser.references
      for (const alias of loser.aliases) {
        if (!winner.aliases.includes(alias)) winner.aliases.push(alias)
      }
    }
    kept.push(winner)
  }
  return kept
}

function notesFor(entry: DocEntry, root: string): string[] {
  const notes: string[] = []
  if (entry.symbol.exportKind === "default") notes.push("default export")
  if (entry.exposedAs !== entry.symbol.name) notes.push(`exported as \`${entry.exposedAs}\``)
  if (entry.aliases.length > 0) notes.push(`also exported as: ${entry.aliases.join(", ")}`)
  if (entry.duplicates.length > 0) {
    const where = entry.duplicates.map((file) => display(file, root)).join(", ")
    notes.push(`identical declaration also in: ${where}`)
  }
  return notes
}

/**
 * Document the public surface of a file, a directory, or a list of either.
 *
 * Directories are walked with `collectFiles`, skipping demo/script/test files.
 * Re-exports are followed to the declaring file, so a symbol surfaced by an
 * index barrel is documented once, under the file that actually declares it.
 */
export async function docgen(
  input: string | string[],
  options: DocgenOptions = {},
): Promise<string> {
  const result = await analyze(input, options)
  return result.text
}

/** `docgen` with the intermediate model kept around. */
export async function analyze(
  input: string | string[],
  options: DocgenOptions = {},
): Promise<DocgenResult> {
  const store = createStore(options.extensions ?? DEFAULT_EXTENSIONS)
  const roots = expandInputs(input, options.exclude ?? DEFAULT_PRESETS)
  // Everything downstream is synchronous and reads only from the parse cache.
  await prime(store, roots)
  const kinds = options.kinds ? new Set<SymbolDoc["kind"]>(options.kinds) : null
  const entries = new Map<string, DocEntry>()

  for (const file of roots) {
    for (const hit of exportsOf(store, file).values()) {
      if (kinds && !kinds.has(hit.symbol.kind)) continue
      addEntry(entries, {
        file: hit.file,
        symbol: hit.symbol,
        exposedAs: hit.exposedAs,
        aliases: [],
        duplicates: [],
        references: 0,
        reason: "export",
      })
    }
  }

  expandTypes(store, entries, options)

  const bodies = new Map<DocEntry, string>()
  for (const entry of entries.values()) {
    bodies.set(entry, renderDeclaration(entry.symbol, { includeNonPublic: options.includeNonPublic }))
  }

  const kept = dedupe([...entries.values()], bodies)
  const root = options.root ? resolvePath(options.root) : commonRoot(kept.map((entry) => entry.file))

  const byFile = new Map<string, DocEntry[]>()
  for (const entry of kept) {
    const path = display(entry.file, root)
    const bucket = byFile.get(path)
    if (bucket) bucket.push(entry)
    else byFile.set(path, [entry])
  }

  const files = [...byFile.keys()].sort((a, b) => a.localeCompare(b))
  for (const file of files) {
    byFile.get(file)?.sort(
      (a, b) =>
        KIND_ORDER[a.symbol.kind] - KIND_ORDER[b.symbol.kind] ||
        a.symbol.loc.line - b.symbol.loc.line ||
        a.exposedAs.localeCompare(b.exposedAs),
    )
  }

  const tree = fancyFileTree(
    files.map((file) => [file, (byFile.get(file) ?? []).map((entry) => entry.exposedAs)]),
  )

  const fence = false
  const sections = files.map((file) => {
    const blocks = (byFile.get(file) ?? []).map((entry) => {
      const parts: string[] = []
      const comment = docComment(entry.symbol.description)
      if (comment) parts.push(comment)
      for (const note of notesFor(entry, root)) parts.push(`// ${note}`)
      parts.push(bodies.get(entry) ?? "")
      return parts.join("\n")
    })
    const body = blocks.join("\n\n")
    return `# ${file}\n\n${fence ? `\`\`\`ts\n${body}\n\`\`\`` : body}`
  })

  const unresolved = [...store.unresolved].sort((a, b) => a.localeCompare(b))
  const footer: string[] = []
  if (unresolved.length > 0) footer.push(`> unresolved re-exports: ${unresolved.join(", ")}`)
  for (const [file, message] of store.failed) {
    footer.push(`> failed to parse ${display(file, root)}: ${message}`)
  }

  return {
    text: [tree, ...sections, ...footer].filter(Boolean).join("\n\n"),
    tree,
    entries: kept,
    files,
    unresolved,
    failed: [...store.failed.entries()],
  }
}
