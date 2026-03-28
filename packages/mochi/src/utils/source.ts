// @paladin/mochi/src/utils/source.ts

import type { Node } from "acorn"

/**
 * Extracts the source text for a given AST node.
 */
export function extractSource(source: string, node: Node): string {
  return source.slice(node.start, node.end)
}

/**
 * Extracts the inner body of a block statement (without braces),
 * dedented to the minimum indentation level.
 */
export function extractBody(source: string, blockNode: Node): string {
  // strip outer braces
  const inner = source.slice(blockNode.start + 1, blockNode.end - 1)
  return dedent(inner).trim()
}

/**
 * Removes common leading whitespace from all non-empty lines.
 */
export function dedent(text: string): string {
  const lines = text.split("\n")
  const nonEmpty = lines.filter((l) => l.trim().length > 0)

  if (nonEmpty.length === 0) return text

  const minIndent = Math.min(
    ...nonEmpty.map((l) => {
      const match = l.match(/^(\s*)/)
      return match ? match[1].length : 0
    })
  )

  if (minIndent === 0) return text

  return lines
    .map((l) => (l.trim().length > 0 ? l.slice(minIndent) : ""))
    .join("\n")
}

/**
 * Finds the last ReturnStatement inside a function body node.
 * Returns its `end` position, or null if no return found.
 */
export function findLastReturnEnd(bodyNode: Node): number | null {
  const stmts = (bodyNode as any).body as Node[]
  for (let i = stmts.length - 1; i >= 0; i--) {
    if (stmts[i].type === "ReturnStatement") {
      return stmts[i].end
    }
  }
  return null
}

/**
 * Strips trailing comments (expected values) from the body source.
 * Returns the body with everything after the return statement's
 * semicolon/newline removed.
 */
export function stripExpectedFromBody(
  source: string,
  bodyNode: Node,
  returnEnd: number
): string {
  const bodyStart = bodyNode.start + 1
  const raw = source.slice(bodyStart, returnEnd)
  return dedent(raw).trim()
}
