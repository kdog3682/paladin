import { n } from "./parse"
import type { ParamInfo } from "../types"

// extracts param info from a function's parameter list
// handles: fn(rootDir: string, opts?: { autoInit?: boolean })
// and:     fn({ a, b }: { a: string; b: number })
export function extractParamTypes(params: any[]): ParamInfo[] {
  const out: ParamInfo[] = []
  for (const p of params) {
    // destructured: { a, b }: { a: string; b: number }
    if (n.ObjectPattern.check(p)) {
      const typeLit = getTypeLiteral(p.typeAnnotation)
      for (const prop of p.properties) {
        if (!prop.key) continue
        const key = n.Identifier.check(prop.key)
          ? prop.key.name
          : null
        if (!key) continue
        out.push(resolveFromTypeLiteral(key, typeLit))
      }
      continue
    }
    // simple identifier with optional type annotation: rootDir: string
    if (n.Identifier.check(p)) {
      const info = tsTypeToInfo(p.typeAnnotation?.typeAnnotation)
      out.push({ name: p.name, ...info })
      continue
    }
    // assignment pattern (default values)
    if (n.AssignmentPattern.check(p) && n.Identifier.check(p.left)) {
      const info = tsTypeToInfo(p.left.typeAnnotation?.typeAnnotation)
      out.push({ name: p.left.name, ...info })
    }
  }
  return out
}

function getTypeLiteral(ann: any): any | null {
  if (!ann?.typeAnnotation) return null
  const t = ann.typeAnnotation
  if (t.type === "TSTypeLiteral") return t
  return null
}

function resolveFromTypeLiteral(
  key: string,
  typeLit: any | null,
): ParamInfo {
  if (!typeLit) return { name: key, tsType: "string" }
  for (const m of typeLit.members ?? []) {
    if (m.type !== "TSPropertySignature") continue
    const mKey = n.Identifier.check(m.key) ? m.key.name : null
    if (mKey !== key) continue
    const info = tsTypeToInfo(m.typeAnnotation?.typeAnnotation)
    return { name: key, ...info }
  }
  return { name: key, tsType: "string" }
}

function tsTypeToInfo(t: any): {
  tsType: string
  literalUnion?: string[]
} {
  if (!t) return { tsType: "string" }
  switch (t.type) {
    case "TSStringKeyword":
      return { tsType: "string" }
    case "TSNumberKeyword":
      return { tsType: "number" }
    case "TSBooleanKeyword":
      return { tsType: "boolean" }
    case "TSArrayType":
      return { tsType: "array" }
    case "TSTypeLiteral":
    case "TSTypeReference":
      return { tsType: "object" }
    case "TSUnionType": {
      const literals: string[] = []
      let allStringLiterals = true
      for (const sub of t.types) {
        if (
          sub.type === "TSLiteralType" &&
          typeof sub.literal?.value === "string"
        ) {
          literals.push(sub.literal.value)
        } else {
          allStringLiterals = false
          break
        }
      }
      if (allStringLiterals && literals.length)
        return { tsType: "enum", literalUnion: literals }
      return { tsType: "string" }
    }
    default:
      return { tsType: "string" }
  }
}
