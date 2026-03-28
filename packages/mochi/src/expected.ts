// @paladin/mochi/src/expected.ts

import type { Comment, Node } from "acorn"
import { findTrailingReturnComments } from "./utils/comments"
import { findLastReturnEnd } from "./utils/source"

/**
 * Extracts the expected value string from a function body.
 *
 * Looks for comments after the last return statement and before
 * the closing brace of the function body.
 */
export function extractExpected(
  comments: Comment[],
  bodyNode: Node
): string | null {
  const returnEnd = findLastReturnEnd(bodyNode)
  if (returnEnd === null) return null

  return findTrailingReturnComments(comments, returnEnd, bodyNode.end)
}
