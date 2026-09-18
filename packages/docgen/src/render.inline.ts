import type { DocgenResult } from "./docgen"
import type { TypeDoc, Param } from "./parse.types"
import { commentEnd, hasTopLevel, isQuote, stringEnd } from "./render.format"

export type InlineOpts = {
  /** whether a class member with this visibility is rendered, so hidden members don't count as uses */
  visible: (visibility: string | undefined) => boolean
  /** a type's definition as one type expression, with member docs as comments */
  expression: (doc: TypeDoc) => string
}

export type Inliner = {
  /** names of types folded into their only consumer. these are not rendered on their own */
  inlined: Set<string>
  /** rewrites a type string, swapping each inlined name for its definition */
  expand: (text: string) => string
}

type Usage = {
  /** references across every rendered signature */
  count: number
  /** referenced from an extends or implements clause, where a literal can't stand in */
  heritage: boolean
}

const PASSTHROUGH: Inliner = { inlined: new Set(), expand: (text) => text }
const IDENT = /[A-Za-z_$][\w$]*/y

/**
 * finds the types referenced exactly once across the rendered output and folds them into that one use.
 * generic types, enums, self-referencing or mutually-referencing types, names declared twice,
 * and types used in extends/implements stay standalone.
 */
export function createInliner(result: DocgenResult, opts: InlineOpts, enabled: boolean): Inliner {
  if (!enabled) return PASSTHROUGH

  const byName = new Map<string, TypeDoc>()
  const duplicates = new Set<string>()
  for (const section of result.types) {
    for (const doc of section.types) {
      if (byName.has(doc.name)) duplicates.add(doc.name)
      byName.set(doc.name, doc)
    }
  }

  const usage = new Map<string, Usage>()
  const record = (text: string | undefined, heritage: boolean, self?: string) => {
    if (!text) return
    for (const ident of identifiers(text)) {
      if (ident === self || !byName.has(ident)) continue
      const entry = usage.get(ident) ?? { count: 0, heritage: false }
      entry.count++
      entry.heritage ||= heritage
      usage.set(ident, entry)
    }
  }
  const callable = (typeParams: string[], params: Param[], returns: string | undefined, self?: string) => {
    for (const typeParam of typeParams) record(typeParam, false, self)
    for (const param of params) record(param.type, false, self)
    record(returns, false, self)
  }

  for (const section of result.files) {
    for (const symbol of section.symbols) {
      if (symbol.kind === "function") {
        callable(symbol.typeParams, symbol.params, symbol.returns)
        continue
      }
      for (const typeParam of symbol.typeParams) record(typeParam, false)
      record(symbol.extends, true)
      for (const implemented of symbol.implements) record(implemented, true)
      for (const property of symbol.properties) {
        if (opts.visible(property.visibility) && !property.readonly) record(property.type, false)
      }
      for (const method of symbol.methods) {
        if (opts.visible(method.visibility)) callable(method.typeParams, method.params, method.returns)
      }
    }
  }
  for (const section of result.types) {
    for (const doc of section.types) {
      const self = doc.name
      for (const typeParam of doc.typeParams) record(typeParam, false, self)
      for (const parent of doc.extends) record(parent, true, self)
      for (const property of doc.properties) record(property.type, false, self)
      for (const method of doc.methods) callable(method.typeParams, method.params, method.returns, self)
      if (doc.properties.length === 0 && doc.methods.length === 0) record(doc.value, false, self)
    }
  }

  const candidates = new Set<string>()
  for (const [ident, entry] of usage) {
    const doc = byName.get(ident)!
    if (entry.count !== 1 || entry.heritage || duplicates.has(ident)) continue
    if (doc.kind === "enum" || doc.typeParams.length > 0) continue
    candidates.add(ident)
  }

  const edges = new Map<string, string[]>()
  for (const ident of candidates) {
    edges.set(ident, identifiers(opts.expression(byName.get(ident)!)).filter((ref) => candidates.has(ref)))
  }
  const cyclic = (start: string): boolean => {
    const seen = new Set<string>()
    const stack = [...(edges.get(start) ?? [])]
    while (stack.length > 0) {
      const next = stack.pop()!
      if (next === start) return true
      if (seen.has(next)) continue
      seen.add(next)
      stack.push(...(edges.get(next) ?? []))
    }
    return false
  }
  const inlined = new Set([...candidates].filter((ident) => !cyclic(ident)))

  const cache = new Map<string, string>()
  const definition = (ident: string): string => {
    let hit = cache.get(ident)
    if (hit === undefined) {
      hit = wrap(expand(opts.expression(byName.get(ident)!)))
      cache.set(ident, hit)
    }
    return hit
  }
  const expand = (text: string): string =>
    replaceIdentifiers(text, (ident) => (inlined.has(ident) ? definition(ident) : undefined))

  return { inlined, expand }
}

function identifiers(text: string): string[] {
  const found: string[] = []
  replaceIdentifiers(text, (ident) => {
    found.push(ident)
    return undefined
  })
  return found
}

/** swaps type references, skipping strings, comments, property keys, method names and member access */
function replaceIdentifiers(text: string, replace: (ident: string) => string | undefined): string {
  let out = ""
  let at = 0
  while (at < text.length) {
    const ch = text[at]
    if (ch === "/" && text[at + 1] === "*") {
      const stop = commentEnd(text, at)
      out += text.slice(at, stop)
      at = stop
      continue
    }
    if (isQuote(ch)) {
      const stop = stringEnd(text, at)
      out += text.slice(at, stop)
      at = stop
      continue
    }
    IDENT.lastIndex = at
    const match = IDENT.exec(text)
    if (!match) {
      out += ch
      at++
      continue
    }
    const ident = match[0]
    const stop = at + ident.length
    const before = text[at - 1] ?? ""
    const key = /[\w$.]/.test(before) || /^(\??:|\(|\.)/.test(text.slice(stop))
    out += key ? ident : replace(ident) ?? ident
    at = stop
  }
  return out
}

/** parenthesises a definition that would change meaning when dropped into eg `X[]` */
function wrap(expression: string): string {
  const text = expression.trim()
  const loose = hasTopLevel(text, "|&=?") || /^(keyof|typeof|unique|readonly|infer)\s/.test(text)
  return loose ? `(${text})` : text
}
