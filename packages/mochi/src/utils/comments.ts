// @paladin/mochi/src/utils/comments.ts

import type { Comment, Node } from "acorn"

/**
 * Finds the leading description comment for a function.
 *
 * A leading comment is one that ends between `gapStart` (the end of the
 * previous top-level node, or 0) and the function's own start position.
 *
 * Handles consecutive `//` lines or a single `/* ... *​/` block.
 */
export function findLeadingComment(
  comments: Comment[],
  fnStart: number,
  gapStart: number
): string | null {
  const candidates = comments.filter(
    (c) => c.start >= gapStart && c.end <= fnStart
  )

  if (candidates.length === 0) return null

  // check if the last candidate is a block comment
  const last = candidates[candidates.length - 1]
  if (last.type === "Block") {
    return last.value.trim()
  }

  // collect consecutive line comments ending at the function
  const lines: string[] = []
  for (let i = candidates.length - 1; i >= 0; i--) {
    const c = candidates[i]
    if (c.type !== "Line") break
    lines.unshift(c.value.trim())
  }

  return lines.length > 0 ? lines.join("\n") : null
}

/**
 * Finds comments after the last return statement inside a function body.
 * These are the "expected" value comments.
 *
 * Handles both `// ...` lines and `/* ... *​/` blocks.
 */
export function findTrailingReturnComments(
  comments: Comment[],
  returnEnd: number,
  bodyEnd: number
): string | null {
  const candidates = comments.filter(
    (c) => c.start >= returnEnd && c.end <= bodyEnd
  )

  if (candidates.length === 0) return null

  // single block comment
  if (candidates.length === 1 && candidates[0].type === "Block") {
    return candidates[0].value.trim()
  }

  // line comments
  const lines = candidates
    .filter((c) => c.type === "Line")
    .map((c) => c.value.trim())

  if (lines.length > 0) return lines.join("\n")

  // fallback for block
  if (candidates[0].type === "Block") {
    return candidates[0].value.trim()
  }

  return null
}

/**
 * Given a list of top-level statements, returns an array of `end` positions
 * so we can compute the gap before each export.
 *
 * Index i gives the end of node i. We use `ends[i-1]` (or 0) as
 * the gapStart for node i.
 */
export function nodeEndPositions(body: Node[]): number[] {
  return body.map((n) => n.end)
}
