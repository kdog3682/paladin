import { Node, SyntaxKind, ts } from "ts-morph"
import type { TextEdit } from "./textEdits"

/*
 * Resolves a declaration to the node its comment sits above: the variable statement for a
 * variable declaration, the node itself otherwise.
 */
export function getDocTarget(node: Node): Node {
  return Node.isVariableDeclaration(node) ? node.getVariableStatement() ?? node : node
}

/*
 * Finds the block comment (`/* *\/` or `/** *\/`) sitting directly above a node, with no blank
 * line in between, or directly in front of it on the same line, and returns its start and end
 * offsets. A comment trailing the code on the line above doesn't count.
 */
export function getDocCommentRange(node: Node): [start: number, end: number] | undefined {
  const target = getDocTarget(node)
  const full = target.getSourceFile().getFullText()
  const pos = target.getPos()
  // typescript counts a comment before the first line break as trailing the previous token
  const sameLine = (ts.getTrailingCommentRanges(full, pos) ?? []).map(range => ({ range, sameLine: true }))
  const above = (ts.getLeadingCommentRanges(full, pos) ?? []).map(range => ({ range, sameLine: false }))
  const last = [...sameLine, ...above].filter(({ range }) => range.end <= target.getStart()).at(-1)
  if (!last || last.range.kind !== SyntaxKind.MultiLineCommentTrivia) return
  const gap = full.slice(last.range.end, target.getStart())
  const allowed = last.sameLine ? /^[ \t]*$/ : /^[ \t]*(\r?\n[ \t]*)?$/
  if (!allowed.test(gap)) return
  return [last.range.pos, last.range.end]
}

/* Reads the block comment directly above a node as plain text, without comment markers. */
export function getDocComment(node: Node): string | undefined {
  const range = getDocCommentRange(node)
  if (!range) return
  const text = parseCommentText(node.getSourceFile().getFullText().slice(...range))
  return text || undefined
}

/*
 * Turns comment source into plain text: strips `/*`, `/**`, `*\/` and the leading `*` of each
 * line when the text is wrapped in them, drops blank lines at either end and removes the
 * common indentation. Plain text passes through with only the trimming applied.
 */
export function parseCommentText(raw: string): string {
  let text = raw.trim()
  const wrapped = text.startsWith("/*") && text.endsWith("*/")
  if (wrapped) text = text.replace(/^\/\*\*?/, "").replace(/\*\/$/, "")
  let lines = text.split(/\r?\n/).map(line => (wrapped ? line.replace(/^\s*\* ?/, "") : line).trimEnd())
  while (lines.length && !lines[0]!.trim()) lines.shift()
  while (lines.length && !lines.at(-1)!.trim()) lines.pop()
  const indents = lines.filter(line => line.trim()).map(line => line.match(/^\s*/)![0].length)
  const indent = indents.length ? Math.min(...indents) : 0
  lines = lines.map(line => line.slice(indent))
  return lines.join("\n")
}

/*
 * Formats text as a block comment: `/* text *\/` for a single line, otherwise one ` * ` line
 * per line of text, continued at the given indent. A `*\/` inside the text is escaped.
 */
export function formatDocComment(text: string, indent = ""): string {
  const lines = text.replaceAll("*/", "*\\/").split("\n")
  if (lines.length === 1) return `/* ${lines[0]} */`
  return ["/*", ...lines.map(line => (line ? ` * ${line}` : " *")), " */"].join(`\n${indent}`)
}

/*
 * Builds the edit that sets the comment directly above a node, replacing the one already there
 * or inserting a new one at the node's indentation. A node that shares its line with other code
 * gets a one-line comment in front of it instead.
 */
export function getDocCommentEdit(node: Node, text: string): TextEdit {
  const target = getDocTarget(node)
  const full = target.getSourceFile().getFullText()
  const range = getDocCommentRange(node)
  const start = range?.[0] ?? target.getStart()
  const end = range?.[1] ?? start
  const indent = full.slice(full.lastIndexOf("\n", start - 1) + 1, start)
  if (!/^[ \t]*$/.test(indent)) {
    const comment = formatDocComment(text.replace(/\s*\n\s*/g, " "))
    return { start, end, text: range ? comment : `${comment} ` }
  }
  const comment = formatDocComment(text, indent)
  return { start, end, text: range ? comment : `${comment}\n${indent}` }
}
