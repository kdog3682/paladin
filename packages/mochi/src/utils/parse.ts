// @paladin/mochi/src/utils/parse.ts

import * as acorn from "acorn"
import type { Comment, Program } from "acorn"

export interface ParseResult {
  ast: Program
  comments: Comment[]
  source: string
}

export function parse(source: string): ParseResult {
  const comments: Comment[] = []

  const ast = acorn.parse(source, {
    sourceType: "module",
    ecmaVersion: "latest",
    locations: true,
    ranges: true,
    onComment: comments,
  })

  return { ast, comments, source }
}
