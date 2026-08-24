import type { MethodDoc, Param, SymbolDoc, TypeDoc } from "./parse.types"

const KEYWORDS = new Set([
  "abstract", "any", "asserts", "bigint", "boolean", "const", "extends", "false", "in", "infer",
  "import", "is", "keyof", "never", "new", "null", "number", "object", "out", "readonly",
  "satisfies", "string", "symbol", "this", "true", "typeof", "undefined", "unique", "unknown",
  "void",
])

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

const DECL_PREV = new Set(["", "{", "(", ",", ";", "["])

export function extractTypeRefs(source: string | null | undefined, exclude: Iterable<string> = []): string[] {
  if (!source) return []
  const out: string[] = []
  collect(source, exclude instanceof Set ? exclude : new Set(exclude), out)
  return [...new Set(out)]
}

export function typeParamNames(typeParams: string[] | undefined): string[] {
  const names: string[] = []
  for (const entry of typeParams ?? []) {
    const match = /^\s*(?:const\s+)?(?:(?:in|out)\s+)*([A-Za-z_$][\w$]*)/.exec(entry)
    if (match) names.push(match[1]!)
  }
  return names
}

export function refsFromSymbol(symbol: SymbolDoc): string[] {
  if (symbol.kind === "type" || symbol.kind === "interface" || symbol.kind === "enum") {
    return refsFromType(symbol)
  }
  const exclude = new Set(typeParamNames(symbol.typeParams))
  const out: string[] = []
  addAll(out, symbol.typeParams, exclude)
  if (symbol.kind === "function") {
    addParams(out, symbol.params, exclude)
    add(out, symbol.returns, exclude)
  } else if (symbol.kind === "class") {
    add(out, symbol.extends, exclude)
    addAll(out, symbol.implements, exclude)
    addParams(out, symbol.properties, exclude)
    addMethods(out, symbol.methods, exclude)
  } else {
    add(out, symbol.type, exclude)
  }
  return [...new Set(out)]
}

export function refsFromType(doc: TypeDoc): string[] {
  const exclude = new Set(typeParamNames(doc.typeParams))
  const out: string[] = []
  addAll(out, doc.typeParams, exclude)
  addAll(out, doc.extends, exclude)
  addParams(out, doc.properties, exclude)
  addMethods(out, doc.methods, exclude)
  if (doc.kind !== "enum") add(out, doc.value, exclude)
  return [...new Set(out)]
}

function add(out: string[], source: string | undefined, exclude: Set<string>): void {
  for (const ref of extractTypeRefs(source, exclude)) out.push(ref)
}

function addAll(out: string[], sources: string[] | undefined, exclude: Set<string>): void {
  for (const source of sources ?? []) add(out, source, exclude)
}

function addParams(out: string[], params: Param[] | undefined, exclude: Set<string>): void {
  for (const param of params ?? []) add(out, param.type, exclude)
}

function addMethods(out: string[], methods: MethodDoc[] | undefined, exclude: Set<string>): void {
  for (const method of methods ?? []) {
    const inner = new Set([...exclude, ...typeParamNames(method.typeParams)])
    addAll(out, method.typeParams, inner)
    addParams(out, method.params, inner)
    add(out, method.returns, inner)
  }
}

function collect(text: string, exclude: Set<string>, out: string[]): void {
  let i = 0
  while (i < text.length) {
    const ch = text[i]!
    if (ch === '"' || ch === "'") {
      i = skipQuoted(text, i, ch)
      continue
    }
    if (ch === "`") {
      i = skipTemplate(text, i, exclude, out)
      continue
    }
    if (isIdentStart(ch)) {
      const start = i
      i = readChain(text, i)
      const chain = text.slice(start, i)
      const dot = chain.indexOf(".")
      const head = dot === -1 ? chain : chain.slice(0, dot)
      if (KEYWORDS.has(head) || exclude.has(head)) continue
      if (prevChar(text, start).char === ".") continue
      if (isDeclName(text, start, i)) continue
      out.push(chain)
      continue
    }
    i++
  }
}

function isDeclName(text: string, start: number, end: number): boolean {
  const prev = prevChar(text, start)
  if (!prev.newline && !DECL_PREV.has(prev.char)) return false
  let next = nextChar(text, end)
  if (next.char === "?") next = nextChar(text, next.index + 1)
  return next.char === ":" || next.char === "("
}

function prevChar(text: string, index: number): { char: string, newline: boolean } {
  let i = index - 1
  let newline = false
  while (i >= 0) {
    const ch = text[i]!
    if (ch === "\n") {
      newline = true
      i--
      continue
    }
    if (ch === " " || ch === "\t" || ch === "\r") {
      i--
      continue
    }
    return { char: ch, newline }
  }
  return { char: "", newline }
}

function nextChar(text: string, index: number): { char: string, index: number } {
  let i = index
  while (i < text.length) {
    const ch = text[i]!
    if (ch === " " || ch === "\t" || ch === "\r" || ch === "\n") {
      i++
      continue
    }
    return { char: ch, index: i }
  }
  return { char: "", index: text.length }
}

function skipQuoted(text: string, index: number, quote: string): number {
  let i = index + 1
  while (i < text.length) {
    const ch = text[i]!
    if (ch === "\\") {
      i += 2
      continue
    }
    if (ch === quote) return i + 1
    i++
  }
  return text.length
}

function skipTemplate(text: string, index: number, exclude: Set<string>, out: string[]): number {
  let i = index + 1
  while (i < text.length) {
    const ch = text[i]!
    if (ch === "\\") {
      i += 2
      continue
    }
    if (ch === "`") return i + 1
    if (ch === "$" && text[i + 1] === "{") {
      let depth = 1
      let j = i + 2
      while (j < text.length && depth > 0) {
        if (text[j] === "{") depth++
        else if (text[j] === "}") depth--
        j++
      }
      collect(text.slice(i + 2, Math.max(i + 2, j - 1)), exclude, out)
      i = j
      continue
    }
    i++
  }
  return text.length
}

function readChain(text: string, index: number): number {
  let i = readIdent(text, index)
  while (text[i] === "." && text[i + 1] !== undefined && isIdentStart(text[i + 1]!)) {
    i = readIdent(text, i + 1)
  }
  return i
}

function readIdent(text: string, index: number): number {
  let i = index
  while (i < text.length && isIdentPart(text[i]!)) i++
  return i
}

function isIdentStart(ch: string): boolean {
  return /[A-Za-z_$]/.test(ch)
}

function isIdentPart(ch: string): boolean {
  return /[A-Za-z0-9_$]/.test(ch)
}
