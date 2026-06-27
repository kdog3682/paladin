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

function paramsTable(p: Param[]): string {
  if (!p.length) return ""
  const rows = p.map(x =>
    `| \`${x.name}${x.optional ? "?" : ""}\` | \`${x.type}\` |`
  ).join("\n")
  return "\n| Param | Type |\n|-------|------|\n" + rows
}

function humanFunction(f: FunctionDoc): string {
  const mods = [f.async ? "async" : "", "function"].filter(Boolean).join(" ")
  const sig = `\`\`\`ts\n${mods} ${f.name}${params(f.params)}: ${f.returns}\n\`\`\``
  const lines = [`### \`${f.name}\``, ""]
  if (f.description) lines.push(f.description, "")
  lines.push(sig)
  const table = paramsTable(f.params)
  if (table) lines.push(table)
  return lines.join("\n")
}

function humanMethod(m: MethodDoc): string {
  const mods = [
    m.visibility !== "public" ? m.visibility : "",
    m.static ? "static" : "",
    m.getter ? "get" : "",
    m.setter ? "set" : "",
    m.async ? "async" : "",
  ].filter(Boolean).join(" ")
  const sig = `${mods ? mods + " " : ""}${m.name}${params(m.params)}: ${m.returns}`
  const lines = [`#### \`${m.name}\``]
  if (m.description) lines.push("", m.description)
  lines.push("", `\`\`\`ts\n${sig}\n\`\`\``)
  const table = paramsTable(m.params)
  if (table) lines.push(table)
  return lines.join("\n")
}

function humanClass(c: ClassDoc): string {
  const lines = [`### \`${c.name}\``, ""]
  if (c.description) lines.push(c.description, "")
  if (c.properties.length) {
    lines.push("**Properties**", "")
    lines.push("| Name | Type |", "|------|------|")
    for (const p of c.properties) {
      lines.push(`| \`${p.name}${p.optional ? "?" : ""}\` | \`${p.type}\` |`)
    }
    lines.push("")
  }
  if (c.methods.length) {
    lines.push("**Methods**", "")
    for (const m of c.methods) lines.push(humanMethod(m), "")
  }
  return lines.join("\n")
}

function humanType(t: TypeDoc): string {
  const lines = [`### \`${t.name}\``]
  if (t.description) lines.push("", t.description)
  if (t.kind === "enum") {
    lines.push("", "**Members**", "")
    for (const p of t.properties) lines.push(`- \`${p.name}\``)
  } else if (t.properties.length) {
    lines.push("", "| Field | Type | Required |", "|-------|------|----------|")
    for (const p of t.properties) {
      lines.push(`| \`${p.name}\` | \`${p.type}\` | ${p.optional ? "No" : "Yes"} |`)
    }
  } else if (t.signature) {
    lines.push("", `\`\`\`ts\n${t.signature}\n\`\`\``)
  }
  return lines.join("\n")
}

/**
 * Format a DirectoryDoc into human-readable markdown documentation.
 */
export function formatHuman(doc: DirectoryDoc): string {
  const lines: string[] = [`# ${doc.root}`, ""]
  const shared = collectReferenced(doc)

  if (shared.size) {
    lines.push("## Types", "")
    for (const [, sym] of shared) {
      if (sym.kind === "type" || sym.kind === "interface" || sym.kind === "enum") {
        lines.push(humanType(sym as TypeDoc), "")
      }
    }
  }

  for (const file of doc.files) {
    const exported = file.symbols.filter(s => s.exported)
    if (!exported.length) continue
    lines.push(`## ${file.path}`, "")
    for (const sym of exported) {
      if (sym.kind === "function") lines.push(humanFunction(sym as FunctionDoc), "")
      else if (sym.kind === "class") lines.push(humanClass(sym as ClassDoc), "")
      else if (sym.kind === "type" || sym.kind === "interface" || sym.kind === "enum") {
        if (!shared.has(sym.name)) lines.push(humanType(sym as TypeDoc), "")
      }
    }
  }

  return lines.join("\n")
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
