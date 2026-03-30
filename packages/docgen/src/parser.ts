// @paladin/docgen/parser.ts

import { parseFileSync, type Module } from "@swc/core"
import { readFileSync } from "fs"

export interface ParsedFile {
  ast: Module
  source: string
}

export function parseFile(filePath: string): ParsedFile {
  const source = readFileSync(filePath, "utf-8")
  const ast = parseFileSync(filePath, {
    syntax: "typescript",
    tsx: filePath.endsWith(".tsx"),
    comments: true,
    target: "esnext",
  })

  return { ast, source }
}

/**
 * Extract the leading JSDoc comment for a node by scanning
 * backwards from its span start in the source text.
 */
export function extractDocComment(source: string, spanStart: number): string | null {
  const before = source.slice(0, spanStart).trimEnd()

  if (!before.endsWith("*/")) return null

  const commentEnd = before.length
  const commentStart = before.lastIndexOf("/**")
  if (commentStart === -1) return null

  const raw = before.slice(commentStart, commentEnd)
  return parseDocBlock(raw)
}

/**
 * Extract the module-level docstring — the first `/** ... *​/` comment
 * that appears before any code in the file.
 */
export function extractModuleDoc(source: string): string | null {
  const trimmed = source.trimStart()

  // skip shebang
  let start = 0
  if (trimmed.startsWith("#!")) {
    start = trimmed.indexOf("\n") + 1
  }

  // skip leading whitespace/blank lines after shebang
  const rest = trimmed.slice(start).trimStart()

  if (!rest.startsWith("/**")) return null

  const endIdx = rest.indexOf("*/")
  if (endIdx === -1) return null

  const raw = rest.slice(0, endIdx + 2)

  // make sure this isn't immediately followed by a declaration on the same line
  // (that would make it a symbol doc, not a module doc)
  const afterComment = rest.slice(endIdx + 2).trimStart()
  const firstLine = afterComment.split("\n")[0]?.trim() ?? ""

  // if the next non-empty thing is an export/import/declaration, this is a module doc
  // if it's something like `function foo` right after, it's a symbol doc
  const declarationKeywords = ["export", "import", "const", "let", "var", "function", "class", "type", "interface", "enum", "abstract", "declare"]
  const isFollowedByDecl = declarationKeywords.some(kw => firstLine.startsWith(kw))

  // only treat as module doc if the comment is standalone (followed by blank line)
  // or followed by imports/exports (which means it's describing the module)
  if (!isFollowedByDecl && firstLine.length > 0) return null

  return parseDocBlock(raw)
}

function parseDocBlock(raw: string): string | null {
  const lines = raw
    .replace(/^\/\*\*/, "")
    .replace(/\*\/$/, "")
    .split("\n")
    .map(line => line.replace(/^\s*\*\s?/, "").trimEnd())
    .filter(line => !line.startsWith("@"))

  const text = lines.join("\n").trim()
  return text || null
}
