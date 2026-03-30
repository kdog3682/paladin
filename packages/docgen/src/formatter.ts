// @paladin/docgen/formatter.ts

import type { DocGenResult, ExportedSymbol, FunctionDoc, ClassDoc, TypeDoc, ConstDoc } from "./types"

export function formatDoc(result: DocGenResult): string {
  const lines: string[] = []

  lines.push(`// ${result.absolutePath}`)

  if (result.description) {
    lines.push(`// ${result.description.split("\n").join("\n// ")}`)
  }

  lines.push("")

  if (result.importStatement) {
    lines.push(result.importStatement)
    lines.push("")
  }

  for (const sym of result.exports) {
    switch (sym.kind) {
      case "function":
        lines.push(formatFunction(sym))
        break
      case "class":
        lines.push(formatClass(sym))
        break
      case "type":
        lines.push(formatType(sym))
        break
      case "const":
        lines.push(formatConst(sym))
        break
    }
    lines.push("")
  }

  return lines.join("\n")
}

function formatFunction(fn: FunctionDoc): string {
  const lines: string[] = []
  if (fn.description) {
    lines.push(`// ${fn.description.split("\n").join("\n// ")}`)
  }
  lines.push(fn.signature)
  return lines.join("\n")
}

function formatClass(cls: ClassDoc): string {
  const lines: string[] = []
  if (cls.description) {
    lines.push(`// ${cls.description.split("\n").join("\n// ")}`)
  }
  lines.push(`class ${cls.name} {`)

  for (const prop of cls.properties) {
    const mods: string[] = []
    if (prop.isStatic) mods.push("static")
    if (prop.isReadonly) mods.push("readonly")
    if (prop.visibility !== "public") mods.push(prop.visibility)
    const prefix = mods.length > 0 ? `${mods.join(" ")} ` : ""
    const type = prop.type ? `: ${prop.type}` : ""
    lines.push(`  ${prefix}${prop.name}${type}`)
  }

  if (cls.properties.length > 0 && cls.methods.length > 0) {
    lines.push("")
  }

  for (const method of cls.methods) {
    if (method.description) {
      lines.push(`  // ${method.description.split("\n").join("\n  // ")}`)
    }
    lines.push(`  ${method.signature}`)
  }

  lines.push("}")
  return lines.join("\n")
}

function formatType(t: TypeDoc): string {
  const lines: string[] = []
  if (t.description) {
    lines.push(`// ${t.description.split("\n").join("\n// ")}`)
  }

  // for object-like types, align field comments
  if (t.expanded.includes("{\n")) {
    lines.push(`type ${t.name} = ${alignFieldComments(t.expanded)}`)
  } else {
    lines.push(`type ${t.name} = ${t.expanded}`)
  }

  return lines.join("\n")
}

function formatConst(c: ConstDoc): string {
  const lines: string[] = []
  if (c.description) {
    lines.push(`// ${c.description.split("\n").join("\n// ")}`)
  }
  const type = c.type ? `: ${c.type}` : ""
  lines.push(`const ${c.name}${type}`)
  return lines.join("\n")
}

/**
 * Aligns inline comments on fields within a type body to a consistent column.
 *
 *   name: string       // the name
 *   items: Item[]      // the items
 *   optional?: boolean // the optional
 */
function alignFieldComments(body: string): string {
  const lines = body.split("\n")

  // group fields by indent depth so nested braces align independently
  const groups = new Map<number, { idx: number, code: string, comment: string }[]>()

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trimStart()
    if (!trimmed || trimmed === "{" || trimmed === "}" || trimmed === "}[]") continue

    const indent = line.length - trimmed.length

    // already has a comment
    const commentMatch = trimmed.match(/^(.+?)\s*\/\/\s*(.*)$/)
    if (commentMatch) {
      const code = " ".repeat(indent) + commentMatch[1].trimEnd()
      const entry = { idx: i, code, comment: commentMatch[2] }
      if (!groups.has(indent)) groups.set(indent, [])
      groups.get(indent)!.push(entry)
      continue
    }

    // field line — generate comment from field name
    if (trimmed.includes(":")) {
      const colonIdx = trimmed.indexOf(":")
      const fieldName = trimmed.slice(0, colonIdx).replace("?", "").trim()
      const code = " ".repeat(indent) + trimmed.trimEnd()
      const entry = { idx: i, code, comment: fieldName }
      if (!groups.has(indent)) groups.set(indent, [])
      groups.get(indent)!.push(entry)
    }
  }

  const result = [...lines]

  // align each indent group independently
  for (const entries of groups.values()) {
    const maxCodeLen = entries.reduce((max, e) => Math.max(max, e.code.length), 0)
    for (const { idx, code, comment } of entries) {
      const padding = " ".repeat(maxCodeLen - code.length + 2)
      result[idx] = `${code}${padding}// ${comment}`
    }
  }

  return result.join("\n")
}

export function buildImportStatement(names: string[], modulePath: string): string {
  if (names.length === 0) return ""
  const sorted = [...names].sort()
  return `import { ${sorted.join(", ")} } from "${modulePath}"`
}
