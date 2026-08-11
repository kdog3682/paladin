import { resolve as resolvePath } from "node:path"
import { exportsOf, load, resolveSpecifier } from "./resolve"
import type { Decl, Store } from "./docgen.types"
import type { MethodDoc, SymbolDoc } from "./parse.types"

/** Keywords and lib types that never resolve to a documentable declaration. */
const RESERVED = new Set([
  "any", "unknown", "never", "void", "null", "undefined", "object", "string", "number",
  "boolean", "bigint", "symbol", "this", "true", "false", "keyof", "typeof", "infer",
  "extends", "in", "is", "asserts", "readonly", "new", "import", "as", "satisfies",
  "const", "out", "function", "abstract", "static", "public", "private", "protected",
  "get", "set", "async", "declare", "type", "interface", "enum", "class", "let", "var",
  "of", "yield", "await", "return", "default", "global",
  "Array", "ReadonlyArray", "Promise", "PromiseLike", "Map", "ReadonlyMap", "Set",
  "ReadonlySet", "WeakMap", "WeakSet", "Record", "Partial", "Required", "Readonly",
  "Pick", "Omit", "Exclude", "Extract", "NonNullable", "Parameters", "ReturnType",
  "ConstructorParameters", "InstanceType", "Awaited", "NoInfer", "ThisType",
  "Uppercase", "Lowercase", "Capitalize", "Uncapitalize", "Iterable", "AsyncIterable",
  "Iterator", "IteratorResult", "Generator", "AsyncGenerator", "IterableIterator",
  "Date", "RegExp", "Error", "Function", "Object", "JSON", "Math", "String", "Number",
  "Boolean", "Symbol", "BigInt", "ArrayBuffer", "SharedArrayBuffer", "DataView",
  "Uint8Array", "Int8Array", "Float32Array", "Float64Array", "Buffer", "Blob",
  "URL", "URLSearchParams", "Request", "Response", "Headers", "AbortSignal",
])

const TYPE_KINDS = new Set<SymbolDoc["kind"]>(["type", "interface", "enum", "class"])

export function unique<T>(values: T[]): T[] {
  return [...new Set(values)]
}

/**
 * Pull candidate type names out of a type string. Deliberately loose: a false
 * positive costs nothing because names are only kept once they resolve to a
 * real declaration.
 */
export function typeNames(source: string | undefined): string[] {
  if (!source) return []
  const cleaned = source.replace(/(['"`])(?:\\.|(?!\1)[\s\S])*?\1/g, '""')
  const pattern = /(\.)?\b([A-Za-z_$][A-Za-z0-9_$]*)\b/g
  const names: string[] = []
  let match: RegExpExecArray | null
  while ((match = pattern.exec(cleaned)) !== null) {
    // Right-hand side of a qualified name: `ns.Foo` contributes `ns` only.
    if (match[1]) continue
    const name = match[2]
    if (!name || RESERVED.has(name)) continue
    names.push(name)
  }
  return unique(names)
}

function methodRefs(method: MethodDoc): string[] {
  const out: string[] = []
  for (const tp of method.typeParams) out.push(...typeNames(tp))
  for (const param of method.params) out.push(...typeNames(param.type))
  out.push(...typeNames(method.returns))
  return out
}

/** Every type name a symbol mentions in its signature, members and heritage. */
export function typeRefs(symbol: SymbolDoc): string[] {
  const out: string[] = []
  for (const tp of symbol.typeParams) out.push(...typeNames(tp))

  switch (symbol.kind) {
    case "function": {
      for (const param of symbol.params) out.push(...typeNames(param.type))
      out.push(...typeNames(symbol.returns))
      break
    }
    case "class": {
      out.push(...typeNames(symbol.extends))
      for (const impl of symbol.implements) out.push(...typeNames(impl))
      for (const prop of symbol.properties) out.push(...typeNames(prop.type))
      for (const method of symbol.methods) out.push(...methodRefs(method))
      break
    }
    case "type":
    case "interface":
    case "enum": {
      for (const heritage of symbol.extends) out.push(...typeNames(heritage))
      for (const prop of symbol.properties) out.push(...typeNames(prop.type))
      for (const method of symbol.methods) out.push(...methodRefs(method))
      out.push(...typeNames(symbol.value))
      break
    }
    default: {
      out.push(...typeNames(symbol.type))
      break
    }
  }

  return unique(out.filter((name) => name !== symbol.name))
}

function score(decl: Decl): number {
  let value = 0
  if (!TYPE_KINDS.has(decl.symbol.kind)) value += 10
  if (decl.symbol.exportKind === "none") value += 4
  return value
}

function pick(decls: Decl[]): Decl | null {
  if (decls.length === 0) return null
  return [...decls].sort((a, b) => score(a) - score(b))[0] ?? null
}

/** Name -> declarations index, rebuilt whenever the parse cache grows. */
export function createIndex(store: Store) {
  let size = -1
  let index = new Map<string, Decl[]>()

  const rebuild = () => {
    index = new Map()
    for (const [file, doc] of store.docs) {
      for (const symbol of doc.symbols) {
        const names = unique([symbol.name, symbol.exportedAs ?? symbol.name])
        for (const name of names) {
          const bucket = index.get(name)
          if (bucket) bucket.push({ file, symbol })
          else index.set(name, [{ file, symbol }])
        }
      }
    }
    size = store.docs.size
  }

  return {
    get(name: string): Decl[] {
      if (size !== store.docs.size) rebuild()
      return index.get(name) ?? []
    },
  }
}

export type DeclIndex = ReturnType<typeof createIndex>

/**
 * Resolve a type name as seen from `fromFile`: local declaration first, then the
 * file's own imports (which may pull in a file we have not parsed yet), then any
 * declaration of that name anywhere in the tree.
 */
export function resolveRef(
  store: Store,
  index: DeclIndex,
  fromFile: string,
  name: string,
): Decl | null {
  const abs = resolvePath(fromFile)
  const doc = store.docs.get(abs)

  if (doc) {
    const local = doc.symbols.find((symbol) => symbol.name === name)
    if (local) return { file: abs, symbol: local }

    for (const imp of doc.imports) {
      const binding = imp.bindings.find((entry) => entry.name === name)
      if (!binding) continue
      if (binding.kind === "namespace") return null
      const target = resolveSpecifier(abs, imp.source, store.extensions)
      if (!target) {
        store.unresolved.add(imp.source)
        return null
      }
      if (binding.kind === "default") {
        const targetDoc = load(store, target)
        const fallback = targetDoc?.symbols.find((symbol) => symbol.exportKind === "default")
        return fallback ? { file: resolvePath(target), symbol: fallback } : null
      }
      const hit = exportsOf(store, target).get(binding.imported ?? binding.name)
      return hit ? { file: hit.file, symbol: hit.symbol } : null
    }
  }

  return pick(index.get(name))
}
