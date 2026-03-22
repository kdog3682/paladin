// @paladin/packages/analyze-v2/short-form.ts

import type {
  SymbolDoc,
  FunctionDoc,
  ClassDoc,
  TypeDoc,
  ConstDoc,
  MethodDoc,
  Param,
  ImportRef,
  StatementBlock,
} from "./parse-file.types"
import type { ShortForm } from "./chunk.types"

const MAX_WIDTH = 90

// ─── Type Abbreviations ───

const ABBREV: Record<string, string> = {
  "number": "num",
  "string": "str",
  "boolean": "bool",
  "function": "fn",
  "undefined": "undef",
}

function abbreviateType(type: string): string {
  // Promise<X> → P<X>
  let t = type.replace(/\bPromise\b/g, "P")
  // Simple word replacements
  for (const [full, short] of Object.entries(ABBREV)) {
    t = t.replace(new RegExp(`\\b${full}\\b`, "g"), short)
  }
  return t
}

// ─── Param Formatting ───

function formatParam(p: Param): string {
  const opt = p.optional ? "?" : ""
  const type = abbreviateType(p.type)
  return type && type !== "unknown"
    ? `${p.name}${opt}: ${type}`
    : `${p.name}${opt}`
}

function formatParams(params: Param[]): string {
  return params.map(formatParam).join(", ")
}

// ─── Truncation ───

/** Truncate a value string, keeping start/end and inserting ... */
function truncateValue(value: string, max: number): string {
  if (value.length <= max) return value
  const keep = Math.floor((max - 5) / 2)
  return `${value.slice(0, keep)} ... ${value.slice(-keep)}`
}

// ─── Line Wrapping ───

/**
 * If a signature exceeds MAX_WIDTH, wrap params one-per-line.
 * e.g.
 *   async fn add({
 *     abc: str,
 *     def: num
 *   }): P<str>
 */
function wrapSignature(
  prefix: string,
  params: Param[],
  suffix: string
): string {
  const oneLine = `${prefix}(${formatParams(params)})${suffix}`
  if (oneLine.length <= MAX_WIDTH) return oneLine

  const indent = "  "
  const paramLines = params.map(p => `${indent}${formatParam(p)},`)
  return [
    `${prefix}(`,
    ...paramLines,
    `)${suffix}`,
  ].join("\n")
}

// ─── Builders per Kind ───

function functionSignature(doc: FunctionDoc): string {
  const prefix = [
    doc.exported ? "export" : "",
    doc.async ? "async" : "",
    "fn",
    doc.name,
  ].filter(Boolean).join(" ")
  const ret = abbreviateType(doc.returns)
  const suffix = ret && ret !== "void" ? `: ${ret}` : ""
  return wrapSignature(prefix, doc.params, suffix)
}

function methodSignature(doc: MethodDoc): string {
  const prefix = [
    doc.visibility !== "public" ? doc.visibility : "",
    doc.static ? "static" : "",
    doc.async ? "async" : "",
    doc.getter ? "get" : doc.setter ? "set" : "",
    doc.name,
  ].filter(Boolean).join(" ")
  const ret = abbreviateType(doc.returns)
  const suffix = ret && ret !== "void" ? `: ${ret}` : ""
  return wrapSignature(prefix, doc.params, suffix)
}

function classSignature(doc: ClassDoc): string {
  const publicMethods = doc.methods.filter(m => m.visibility !== "private")
  const methods = publicMethods.map(m => `  ${methodSignature(m)}`)
  const props = doc.properties.map(p => `  ${formatParam(p)}`)
  const members = [...props, ...methods]

  const header = `${doc.exported ? "export " : ""}class ${doc.name}`

  if (members.length === 0) return header + " {}"

  return [header + " {", ...members, "}"].join("\n")
}

function typeSignature(doc: TypeDoc): string {
  // For type aliases with a signature, use it directly (abbreviated)
  if (doc.signature) {
    const sig = abbreviateType(doc.signature)
    return sig.length <= MAX_WIDTH ? sig : truncateValue(sig, MAX_WIDTH)
  }

  const keyword = doc.kind // "type" | "interface" | "enum"
  const header = `${doc.exported ? "export " : ""}${keyword} ${doc.name}`

  if (doc.properties.length === 0) return header

  const fields = doc.properties.map(p => `  ${formatParam(p)}`)

  if (fields.length <= 3) {
    const oneLine = `${header} { ${fields.map(f => f.trim()).join("; ")} }`
    if (oneLine.length <= MAX_WIDTH) return oneLine
  }

  // Truncate middle if many fields
  if (fields.length > 6) {
    const head = fields.slice(0, 3)
    const tail = fields.slice(-2)
    return [header + " {", ...head, "  ...", ...tail, "}"].join("\n")
  }

  return [header + " {", ...fields, "}"].join("\n")
}

function constSignature(doc: ConstDoc): string {
  const keyword = doc.kind // "const" | "variable"
  const type = abbreviateType(doc.type)
  const prefix = `${doc.exported ? "export " : ""}${keyword} ${doc.name}`
  const typeSuffix = type && type !== "unknown" ? `: ${type}` : ""

  if (!doc.value) return `${prefix}${typeSuffix}`

  const full = `${prefix}${typeSuffix} = ${doc.value}`
  if (full.length <= MAX_WIDTH) return full

  return `${prefix}${typeSuffix} = ${truncateValue(doc.value, MAX_WIDTH - prefix.length - typeSuffix.length - 3)}`
}

// ─── Public API ───

export function toShortForm(symbol: SymbolDoc): ShortForm {
  let signature: string

  switch (symbol.kind) {
    case "function":
      signature = functionSignature(symbol)
      break
    case "class":
      signature = classSignature(symbol)
      break
    case "type":
    case "interface":
    case "enum":
      signature = typeSignature(symbol)
      break
    case "const":
    case "variable":
      signature = constSignature(symbol)
      break
    default:
      signature = symbol.name
  }

  return {
    signature,
    docstr: symbol.docstr || undefined,
  }
}

export function importsShortForm(imports: ImportRef[]): ShortForm {
  const lines = imports.map(imp => {
    if (imp.symbols.length === 0) return `import "${imp.source}"`
    if (imp.symbols.length <= 3) {
      return `import { ${imp.symbols.join(", ")} } from "${imp.source}"`
    }
    const shown = imp.symbols.slice(0, 2).join(", ")
    const remaining = imp.symbols.length - 2
    return `import { ${shown}, ...${remaining} more } from "${imp.source}"`
  })
  return { signature: lines.join("\n") }
}

export function statementShortForm(stmt: StatementBlock): ShortForm {
  const firstLine = stmt.source.split("\n")[0].slice(0, MAX_WIDTH)
  const truncated = firstLine.length < stmt.source.split("\n")[0].length
    || stmt.source.includes("\n")
  return {
    signature: truncated ? firstLine + " ..." : firstLine,
  }
}
