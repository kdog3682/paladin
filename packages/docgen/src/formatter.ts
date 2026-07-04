// @paladin/codeform/formatter.ts

import type {
  FileDoc,
  SymbolDoc,
  FunctionDoc,
  ClassDoc,
  TypeDoc,
  MethodDoc,
  Param,
} from "./documenter.types"

// ---------- reshaped data (frontend-consumable) ----------

export interface ReshapedFile {
  path: string
  importPath: string
  functions: FunctionDoc[]
  classes: ClassDoc[]
  types: TypeDoc[]
  exports: string[]
}

export interface SharedGroup {
  source: string
  importPath: string
  types: TypeDoc[]
}

export interface Reshaped {
  shared: SharedGroup[]
  files: ReshapedFile[]
}

// ---------- helpers ----------

function isCallable(s: SymbolDoc): s is FunctionDoc | ClassDoc {
  return s.kind === "function" || s.kind === "class"
}

function isType(s: SymbolDoc): s is TypeDoc {
  return s.kind === "type" || s.kind === "interface" || s.kind === "enum"
}

function toImportPath(abs: string): string {
  const m = abs.match(/\/projects\/([^/]+)\/packages\/([^/]+)\/(.+)$/)
  if (!m) return abs
  const [, project, pkg, rest] = m
  const sub = rest
    .replace(/\.(ts|tsx)$/, "")
    .replace(/^src\//, "")
    .replace(/(^|\/)index$/, "")
  return sub ? `@${project}/${pkg}/${sub}` : `@${project}/${pkg}`
}

/**
 * Collect names of types (defined in the same file) that are referenced
 * by the given functions, classes, or by other referenced types.
 * This ensures that e.g. a non-exported `Config` interface used as a
 * parameter type is included in the formatted output.
 */
function collectReferencedTypeNames(
  functions: FunctionDoc[],
  classes: ClassDoc[],
  typeByName: Map<string, TypeDoc>,
): Set<string> {
  const names = [...typeByName.keys()]
  if (!names.length) return new Set()

  const patterns = names.map(n => ({ name: n, re: new RegExp(`\\b${n}\\b`) }))
  const referenced = new Set<string>()

  const check = (typeStr: string) => {
    for (const { name, re } of patterns) {
      if (re.test(typeStr)) referenced.add(name)
    }
  }

  for (const f of functions) {
    for (const p of f.params) check(p.type)
    check(f.returns)
  }
  for (const c of classes) {
    for (const p of c.properties) check(p.type)
    for (const m of c.methods) {
      for (const p of m.params) check(p.type)
      check(m.returns)
    }
  }

  // recursively resolve types referenced by other referenced types
  let changed = true
  while (changed) {
    changed = false
    for (const name of [...referenced]) {
      const t = typeByName.get(name)
      if (!t) continue
      const before = referenced.size
      if (t.signature) check(t.signature)
      for (const p of t.properties) check(p.type)
      if (referenced.size > before) changed = true
    }
  }

  return referenced
}

// ---------- reshape ----------

export function reshapeData(input: FileDoc | FileDoc[]): Reshaped {
  const files = Array.isArray(input) ? input : [input]

  const index = new Map<string, { file: string; sym: SymbolDoc }>()
  for (const file of files)
    for (const sym of file.symbols)
      index.set(sym.name, { file: file.path, sym })

  // a type is shared if another file imports it
  const shared = new Map<string, { type: TypeDoc; file: string }>()
  for (const file of files) {
    for (const imp of file.imports) {
      for (const name of imp.symbols) {
        const entry = index.get(name)
        if (!entry || entry.file === file.path) continue
        if (!isType(entry.sym)) continue
        shared.set(name, { type: entry.sym, file: entry.file })
      }
    }
  }
  const sharedNames = new Set(shared.keys())

  const groups = new Map<string, TypeDoc[]>()
  for (const { type, file } of shared.values()) {
    const arr = groups.get(file) ?? []
    arr.push(type)
    groups.set(file, arr)
  }
  const sharedGroups: SharedGroup[] = [...groups].map(([source, types]) => ({
    source,
    importPath: toImportPath(source),
    types,
  }))

  const reshapedFiles: ReshapedFile[] = []
  for (const file of files) {
    const functions = file.symbols.filter(
      (s): s is FunctionDoc => s.kind === "function" && s.exported,
    )
    const classes = file.symbols.filter(
      (s): s is ClassDoc => s.kind === "class" && s.exported,
    )

    // collect non-exported types referenced by exported functions/classes
    const typeByName = new Map<string, TypeDoc>(
      file.symbols.filter(isType).map(s => [s.name, s]),
    )
    const referencedNames = collectReferencedTypeNames(functions, classes, typeByName)

    // include exported non-shared types, plus non-exported types that are
    // referenced by included functions/classes (e.g. `Config` used as a param)
    const types = file.symbols.filter(
      (s): s is TypeDoc =>
        isType(s) && !sharedNames.has(s.name) && (s.exported || referencedNames.has(s.name)),
    )
    if (!functions.length && !classes.length && !types.length) continue

    reshapedFiles.push({
      path: file.path,
      importPath: toImportPath(file.path),
      functions,
      classes,
      types,
      exports: [...functions, ...classes, ...types.filter(t => t.exported)].map(s => s.name),
    })
  }

  return { shared: sharedGroups, files: reshapedFiles }
}

// ---------- signatures ----------

function params(p: Param[]): string {
  if (!p.length) return "()"
  return "(" + p.map(x =>
    `${x.name}${x.optional ? "?" : ""}: ${x.type}`
  ).join(", ") + ")"
}

function desc(d: string): string {
  return d ? ` — ${d}` : ""
}

function formatFunction(f: FunctionDoc): string {
  const prefix = f.async ? "async fn" : "fn"
  return `${prefix} ${f.name}${params(f.params)}: ${f.returns}${desc(f.description)}`
}

function formatMethod(m: MethodDoc): string {
  const mods = [
    m.visibility !== "public" ? m.visibility : "",
    m.static ? "static" : "",
    m.getter ? "get" : "",
    m.setter ? "set" : "",
    m.async ? "async" : "",
  ].filter(Boolean).join(" ")
  const prefix = mods ? `${mods} ` : ""
  return `  .${prefix}${m.name}${params(m.params)}: ${m.returns}${desc(m.description)}`
}

function formatClass(c: ClassDoc): string {
  const lines = [`class ${c.name}${desc(c.description)}`]
  for (const p of c.properties) {
    lines.push(`  .${p.name}${p.optional ? "?" : ""}: ${p.type}`)
  }
  for (const m of c.methods) lines.push(formatMethod(m))
  return lines.join("\n")
}

function formatType(t: TypeDoc): string {
  if (t.kind === "enum") {
    const members = t.properties.map(p => p.name).join(", ")
    if (!members) return `enum ${t.name}${desc(t.description)}`
    return `enum ${t.name} { ${members} }${desc(t.description)}`
  }
  if (t.signature) return t.signature + desc(t.description)
  const props = t.properties.map(p =>
    `${p.name}${p.optional ? "?" : ""}: ${p.type}`
  ).join(", ")
  if (!props) return `${t.kind} ${t.name}${desc(t.description)}`
  return `${t.kind} ${t.name} { ${props} }${desc(t.description)}`
}

// ---------- format ----------

function isReshaped(x: FileDoc | FileDoc[] | Reshaped): x is Reshaped {
  return !Array.isArray(x)
    && Array.isArray((x as Reshaped).files)
    && Array.isArray((x as Reshaped).shared)
}

export function format(input: FileDoc | FileDoc[] | Reshaped): string {
  const data = isReshaped(input) ? input : reshapeData(input)
  const blocks: string[] = []

  for (const g of data.shared) {
    const header = `import type { ${g.types.map(t => t.name).join(", ")} } from "${g.importPath}"`
    blocks.push(header + "\n\n" + g.types.map(formatType).join("\n"))
  }

  for (const file of data.files) {
    const onlyTypes = !file.functions.length && !file.classes.length
    const kw = onlyTypes ? "import type" : "import"
    const header = `${kw} { ${file.exports.join(", ")} } from "${file.importPath}"`
    const body: string[] = []
    // types first so referenced types (e.g. Config) appear before the
    // functions/classes that use them
    for (const t of file.types) body.push(formatType(t))
    for (const f of file.functions) body.push(formatFunction(f))
    for (const c of file.classes) body.push(formatClass(c))
    blocks.push(header + "\n\n" + body.join("\n"))
  }

  return blocks.join("\n\n") + "\n"
}