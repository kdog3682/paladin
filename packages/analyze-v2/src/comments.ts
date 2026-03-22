// @paladin/packages/analyze-v2/comments.ts

import type Parser from "tree-sitter"

function getText(node: Parser.SyntaxNode, source: string): string {
  return source.slice(node.startIndex, node.endIndex)
}

export function isComment(node: Parser.SyntaxNode): boolean {
  return node.type === "comment"
}

export function isJSDoc(node: Parser.SyntaxNode, source: string): boolean {
  return isComment(node) && getText(node, source).startsWith("/**")
}

/**
 * Section separators like `// — Types & Interfaces —`
 * These are decorative and shouldn't attach to symbols.
 */
export function isSectionComment(node: Parser.SyntaxNode, source: string): boolean {
  if (!isComment(node)) return false
  if (isJSDoc(node, source)) return false
  return /^\/\/\s*[—\-=]/.test(getText(node, source))
}

/** Matches `// @scope/path.ts` style path comments */
export function isPathComment(node: Parser.SyntaxNode, source: string): boolean {
  return isComment(node) && /^\/\/\s*@[\w\-/.]+/.test(getText(node, source))
}

/** Strip JSDoc delimiters and leading asterisks, return clean text */
export function stripJSDoc(raw: string): string {
  return raw
    .replace(/^\/\*\*\s*/, "")
    .replace(/\s*\*\/$/, "")
    .replace(/^\s*\* ?/gm, "")
    .trim()
}

/**
 * Find the JSDoc comment node immediately preceding `node`.
 * Accounts for export_statement wrapping.
 * Returns null if the previous sibling isn't a JSDoc comment.
 */
export function findJSDocNode(
  node: Parser.SyntaxNode,
  source: string
): Parser.SyntaxNode | null {
  const target = node.parent?.type === "export_statement" ? node.parent : node
  const prev = target.previousNamedSibling
  if (!prev || !isJSDoc(prev, source)) return null
  return prev
}

/** Extract the cleaned JSDoc text for a symbol node */
export function extractJSDoc(node: Parser.SyntaxNode, source: string): string {
  const jsdoc = findJSDocNode(node, source)
  if (!jsdoc) return ""
  return stripJSDoc(getText(jsdoc, source))
}
