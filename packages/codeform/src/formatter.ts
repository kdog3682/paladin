// @paladin/packages/codeform/formatter.ts

import type {
  DirectoryDoc,
  SymbolDoc,
  FunctionDoc,
  ClassDoc,
  TypeDoc,
  MethodDoc,
  Param,
} from "./documenter.types"

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
  for (const m of c.methods) {
    lines.push(formatMethod(m))
  }
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

function isCallable(s: SymbolDoc): s is FunctionDoc | ClassDoc {
  return s.kind === "function" || s.kind === "class"
}

function collectReferenced(doc: DirectoryDoc): Map<string, SymbolDoc> {
  const referenced = new Set<string>()
  for (const file of doc.files) {
    for (const imp of file.imports) {
      if (!imp.resolved) continue
      for (const sym of imp.symbols) {
        if (doc.index[sym]) referenced.add(sym)
      }
    }
  }

  const result = new Map<string, SymbolDoc>()
  for (const name of referenced) {
    const ref = doc.index[name]
    const file = doc.files.find(f => f.path === ref.file)
    const sym = file?.symbols.find(s => s.name === name)
    if (sym && !isCallable(sym)) result.set(name, sym)
  }
  return result
}

/**
 * Format a DirectoryDoc into a concise spec string for agents.
 * Only functions and classes are shown per file.
 * Referenced types/interfaces/enums are hoisted to a Shared section.
 */
export function format(doc: DirectoryDoc): string {
  const lines: string[] = []
  const shared = collectReferenced(doc)

  lines.push(`# ${doc.root}`)

  if (shared.size) {
    lines.push("", "## Shared")
    for (const [, sym] of shared) {
      if (sym.kind === "type" || sym.kind === "interface" || sym.kind === "enum") {
        lines.push(formatType(sym as TypeDoc))
      }
    }
  }

  for (const file of doc.files) {
    const callable = file.symbols.filter(s => isCallable(s) && s.exported)
    if (!callable.length) continue
    lines.push("", `## ${file.path}`)
    for (const sym of callable) {
      if (sym.kind === "function") lines.push(formatFunction(sym))
      else if (sym.kind === "class") lines.push(formatClass(sym))
    }
  }

  return lines.join("\n") + "\n"
}
