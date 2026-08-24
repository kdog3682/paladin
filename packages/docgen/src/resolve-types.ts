import type { FileDoc, SymbolDoc, TypeDoc } from "./parse.types"
import { resolveModule } from "./resolve-module"

export type TypeRequest = {
  /** Name as written at the use site, possibly qualified (`ns.Foo`). */
  name: string
  /** Absolute path of the file the name was referenced from. */
  from: string
}
export type ResolvedType = {
  /** Absolute path of the file that declares the type. */
  path: string
  name: string
  doc: TypeDoc
}
export type ExternalRef = {
  /** Module specifier the type comes from, e.g. `ts-morph`. */
  source: string
  /** Name as exported by that module. */
  name: string
  /** Local name at the use site, when aliased. */
  local: string
}
export type ResolveResult = {
  /** Deduped by declaring file + name, in discovery order. */
  types: ResolvedType[]
  /** Deduped by module + name, in discovery order. */
  externals: ExternalRef[]
  unresolved: TypeRequest[]
}
export type ResolveTypesOptions = {
  load: (path: string) => Promise<FileDoc>
}

export const GLOBAL_TYPES = new Set([
  "Array", "ReadonlyArray", "Promise", "PromiseLike", "Record", "Partial", "Required", "Readonly",
  "Pick", "Omit", "Exclude", "Extract", "NonNullable", "Parameters", "ReturnType", "Awaited",
  "ConstructorParameters", "InstanceType", "ThisParameterType", "OmitThisParameter", "ThisType",
  "Uppercase", "Lowercase", "Capitalize", "Uncapitalize", "NoInfer", "Map", "ReadonlyMap", "Set",
  "ReadonlySet", "WeakMap", "WeakSet", "WeakRef", "Date", "RegExp", "RegExpMatchArray", "Error",
  "TypeError", "Function", "Object", "String", "Number", "Boolean", "Symbol", "BigInt", "JSON",
  "Math", "Iterable", "Iterator", "IterableIterator", "AsyncIterable", "AsyncIterator",
  "AsyncIterableIterator", "Generator", "AsyncGenerator", "ArrayBuffer", "SharedArrayBuffer",
  "DataView", "Int8Array", "Uint8Array", "Uint8ClampedArray", "Int16Array", "Uint16Array",
  "Int32Array", "Uint32Array", "Float32Array", "Float64Array", "BigInt64Array", "BigUint64Array",
  "Buffer", "Blob", "File", "FormData", "Headers", "Request", "Response", "URL", "URLSearchParams",
  "AbortController", "AbortSignal", "ReadableStream", "WritableStream", "TransformStream",
  "Event", "EventTarget", "Intl", "NodeJS", "Console", "globalThis",
])

type Lookup =
  | { kind: "symbol", path: string, symbol: SymbolDoc }
  | { kind: "external", source: string, name: string, local: string }
  | null

export function isTypeSymbol(symbol: SymbolDoc): symbol is TypeDoc {
  return symbol.kind === "type" || symbol.kind === "interface" || symbol.kind === "enum"
}

export async function resolveTypes(seeds: TypeRequest[], options: ResolveTypesOptions): Promise<ResolveResult> {
  const load = options.load
  const types: ResolvedType[] = []
  const externals: ExternalRef[] = []
  const unresolved: TypeRequest[] = []
  const requested = new Set<string>()
  const placed = new Set<string>()
  const queue = [...seeds]

  const lookup = async (name: string, path: string, trail: Set<string>): Promise<Lookup> => {
    const key = `${path}::${name}`
    if (trail.has(key)) return null
    trail.add(key)

    let doc: FileDoc
    try {
      doc = await load(path)
    } catch {
      return null
    }

    const dot = name.indexOf(".")
    const head = dot === -1 ? name : name.slice(0, dot)
    const rest = dot === -1 ? "" : name.slice(dot + 1)

    const local = findSymbol(doc, head)
    if (local) return { kind: "symbol", path, symbol: local }

    for (const ref of doc.imports) {
      for (const binding of ref.bindings) {
        if (binding.name !== head) continue
        const namespaced = binding.kind === "namespace"
        if (namespaced && !rest) continue
        const imported = namespaced ? rest : (binding.imported ?? binding.name)
        const target = resolveModule(ref.source, path)
        if (!target) return { kind: "external", source: ref.source, name: imported, local: head }
        return await lookup(imported, target, trail)
      }
    }

    for (const ref of doc.reExports) {
      if (rest && ref.namespace === head) {
        const target = resolveModule(ref.source, path)
        if (!target) return { kind: "external", source: ref.source, name: rest, local: head }
        return await lookup(rest, target, trail)
      }
      for (const binding of ref.bindings) {
        if (binding.exported !== head) continue
        const target = resolveModule(ref.source, path)
        if (!target) return { kind: "external", source: ref.source, name: binding.name, local: head }
        return await lookup(binding.name, target, trail)
      }
    }

    for (const ref of doc.reExports) {
      if (!ref.star) continue
      const target = resolveModule(ref.source, path)
      if (!target) continue
      const found = await lookup(head, target, trail)
      if (found) return found
    }

    return null
  }

  while (queue.length > 0) {
    const request = queue.shift()!
    const requestKey = `${request.from}::${request.name}`
    if (requested.has(requestKey)) continue
    requested.add(requestKey)

    const found = await lookup(request.name, request.from, new Set())
    if (!found) {
      if (!GLOBAL_TYPES.has(request.name.split(".")[0]!)) unresolved.push(request)
      continue
    }

    if (found.kind === "external") {
      const key = `external:${found.source}#${found.name}`
      if (placed.has(key)) continue
      placed.add(key)
      externals.push({ source: found.source, name: found.name, local: found.local })
      continue
    }

    if (!isTypeSymbol(found.symbol)) continue
    const key = `${found.path}#${found.symbol.name}`
    if (placed.has(key)) continue
    placed.add(key)
    types.push({ path: found.path, name: found.symbol.name, doc: found.symbol })

    for (const ref of found.symbol.typeReferences) queue.push({ name: ref, from: found.path })
  }

  return { types, externals, unresolved }
}

function findSymbol(doc: FileDoc, name: string): SymbolDoc | null {
  return doc.symbols.find((symbol) => symbol.name === name)
    ?? doc.symbols.find((symbol) => symbol.exportedAs === name)
    ?? null
}
