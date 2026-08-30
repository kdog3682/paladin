export type ImportInfo = {
  symbols: string[]
  source: string
}

export type DeclInfo = {
  docstr: string | null
  text: string
  name: string
}

export type QuickParsed = {
  imports: ImportInfo[]
  exports: string[]
  exportDefault: string | null
  functions: DeclInfo[]
  classes: DeclInfo[]
  consts: DeclInfo[]
}

const ID = '[A-Za-z_$][\\w$]*'

const DECL_RE = new RegExp(
  `^(export\\s+)?(?:declare\\s+)?(?:async\\s+)?(function\\*?|abstract\\s+class|class|const|let|var)\\s+(${ID})`
)
const TYPE_DECL_RE = new RegExp(`^export\\s+(?:declare\\s+)?(?:type|interface|enum)\\s+(${ID})`)
const DEFAULT_NAME_RE = new RegExp(`^(?:async\\s+)?(?:function\\*?|class)\\s+(${ID})`)

/**
 * Line-by-line regex parse of a module. Assumes conventional formatting:
 * top-level declarations start at column 0 and close with a `}` at column 0.
 */
export function quickParse(content: string): QuickParsed {
  const lines = content.split(/\r?\n/)
  const out: QuickParsed = {
    imports: [],
    exports: [],
    exportDefault: null,
    functions: [],
    classes: [],
    consts: [],
  }

  let doc: string | null = null
  let i = 0

  while (i < lines.length) {
    const line = lines[i].trim()

    if (!line) {
      doc = null
      i++
      continue
    }

    // ---- comments -------------------------------------------------------
    if (line.startsWith('/**')) {
      const start = i
      while (i < lines.length && !lines[i].includes('*/')) i++
      doc = cleanDoc(lines.slice(start, Math.min(i, lines.length - 1) + 1))
      i++
      continue
    }
    if (line.startsWith('/*')) {
      while (i < lines.length && !lines[i].includes('*/')) i++
      i++
      continue
    }
    if (line.startsWith('//')) {
      i++
      continue
    }
    if (line.startsWith('@')) {
      // decorator: keep the pending doc for the declaration below it
      i++
      continue
    }

    // ---- imports --------------------------------------------------------
    if (/^import\b/.test(line) && !/^import\s*\(/.test(line)) {
      const [text, end] = readBlock(lines, i)
      const imp = parseImport(text)
      if (imp) out.imports.push(imp)
      i = end + 1
      doc = null
      continue
    }

    // ---- export default -------------------------------------------------
    if (/^export\s+default\b/.test(line)) {
      const [text, end] = readBlock(lines, i)
      const rest = line.replace(/^export\s+default\s*/, '')
      const named = rest.match(DEFAULT_NAME_RE)
      const expr = rest.replace(/\s*[{;]\s*$/, '').trim()

      out.exportDefault = named ? named[1] : expr || null

      if (named) {
        const decl: DeclInfo = { docstr: doc, text, name: named[1] }
        if (/class/.test(rest)) out.classes.push(decl)
        else out.functions.push(decl)
      }

      i = end + 1
      doc = null
      continue
    }

    // ---- export { a, b as c } / export * from '...' ----------------------
    if (/^export\s*\*/.test(line)) {
      const [, end] = readBlock(lines, i)
      out.exports.push('*')
      i = end + 1
      doc = null
      continue
    }
    if (/^export\s+(?:type\s*)?\{/.test(line)) {
      const [text, end] = readBlock(lines, i)
      for (const name of parseBraceList(text)) out.exports.push(name)
      i = end + 1
      doc = null
      continue
    }

    // ---- type / interface / enum ----------------------------------------
    const typeMatch = line.match(TYPE_DECL_RE)
    if (typeMatch) {
      const [, end] = readBlock(lines, i)
      out.exports.push(typeMatch[1])
      i = end + 1
      doc = null
      continue
    }

    // ---- function / class / const ---------------------------------------
    const decl = line.match(DECL_RE)
    if (decl) {
      const [, exported, kindRaw, name] = decl
      const [text, end] = readBlock(lines, i)
      const kind = kindRaw.replace(/^abstract\s+/, '')
      const info: DeclInfo = { docstr: doc, text, name }

      if (kind.startsWith('function')) out.functions.push(info)
      else if (kind === 'class') out.classes.push(info)
      else out.consts.push(info)

      if (exported) out.exports.push(name)

      i = end + 1
      doc = null
      continue
    }

    doc = null
    i++
  }

  return out
}

// ---------------------------------------------------------------------------

function parseImport(stmt: string): ImportInfo | null {
  const flat = stmt.replace(/\s+/g, ' ').trim()
  const src =
    flat.match(/\bfrom\s*['"]([^'"]+)['"]/) ?? flat.match(/^import\s*['"]([^'"]+)['"]/)
  if (!src) return null

  const source = src[1]
  const clause = flat
    .replace(/^import\s*/, '')
    .replace(/\bfrom\s*['"][^'"]+['"]\s*;?$/, '')
    .replace(/^type\s+/, '')
    .trim()

  if (!clause || /^['"]/.test(clause)) return { symbols: [], source }

  const symbols: string[] = []
  const braced = clause.match(/\{([\s\S]*)\}/)
  if (braced) symbols.push(...parseBraceList(braced[0]))

  const head = clause.replace(/\{[\s\S]*\}/, '').replace(/,\s*$/, '').trim()
  for (const part of head.split(',')) {
    const p = part.trim()
    if (!p) continue
    const ns = p.match(new RegExp(`^\\*\\s+as\\s+(${ID})$`))
    if (ns) symbols.unshift(`* as ${ns[1]}`)
    else if (new RegExp(`^${ID}$`).test(p)) symbols.unshift(p)
  }

  return { symbols, source }
}

function parseBraceList(text: string): string[] {
  const inner = text.slice(text.indexOf('{') + 1, text.lastIndexOf('}'))
  return inner
    .split(',')
    .map(part => {
      const p = part.trim().replace(/^type\s+/, '')
      if (!p) return ''
      const aliased = p.match(new RegExp(`\\bas\\s+(${ID}|default)$`))
      if (aliased) return aliased[1]
      return p.split(/\s+/)[0]
    })
    .filter(Boolean)
}

function cleanDoc(block: string[]): string {
  return block
    .map(l =>
      l
        .trim()
        .replace(/^\/\*\*+/, '')
        .replace(/\*+\/\s*$/, '')
        .replace(/^\*\s?/, '')
    )
    .join('\n')
    .trim()
}

/**
 * Reads a whole statement/declaration starting at `start`, following bracket
 * depth (strings and comments ignored, template literals may span lines).
 * Returns the raw source text and the index of its last line.
 */
function readBlock(lines: string[], start: number): [string, number] {
  let depth = 0
  let quote: string | null = null
  let end = start

  for (let i = start; i < lines.length; i++) {
    const scan = scanLine(lines[i], quote)
    quote = scan.quote
    depth += scan.delta
    end = i

    if (depth <= 0 && !quote) {
      const code = scan.code.trim()
      if (!/(?:=>|[=,+\-*/&|?:])$/.test(code)) break
    }
  }

  return [lines.slice(start, end + 1).join('\n'), end]
}

function scanLine(line: string, carried: string | null) {
  let code = ''
  let delta = 0
  let quote = carried

  for (let i = 0; i < line.length; i++) {
    const c = line[i]

    if (quote) {
      if (c === '\\') { i++; continue }
      if (c === quote) quote = null
      continue
    }

    if (c === '"' || c === "'" || c === '`') { quote = c; continue }
    if (c === '/' && line[i + 1] === '/') break
    if (c === '/' && line[i + 1] === '*') {
      const close = line.indexOf('*/', i + 2)
      if (close === -1) break
      i = close + 1
      continue
    }

    if (c === '{' || c === '[' || c === '(') delta++
    else if (c === '}' || c === ']' || c === ')') delta--
    code += c
  }

  // only template literals survive a line break
  return { code, delta, quote: quote === '`' ? '`' : null }
}
