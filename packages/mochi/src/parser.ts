// @paladin/mochi/src/parser.ts

import type { Node } from "acorn"
import type { MochiSuite, MochiStory, MochiGlobal, MochiHooks, HookName } from "./types"
import { HOOK_NAMES } from "./types"
import { parse } from "./utils/parse"
import { extractExportedFunctions, extractTopLevelVars } from "./utils/exports"
import { findLeadingComment, nodeEndPositions } from "./utils/comments"
import { extractBody, extractSource, findLastReturnEnd, stripExpectedFromBody } from "./utils/source"
import { extractExpected } from "./expected"

/**
 * Parses a mochi source file into a MochiSuite (without results — that's the runner's job).
 */
export function parseMochiSource(source: string, filePath: string): Omit<MochiSuite, "results"> {
  const { ast, comments } = parse(source)
  const body = (ast as any).body as Node[]
  const ends = nodeEndPositions(body)

  const exportedFns = extractExportedFunctions(ast)
  const topLevelVars = extractTopLevelVars(ast)

  const hooks: MochiHooks = {
    beforeAll: false,
    beforeEach: false,
    afterEach: false,
    afterAll: false,
  }

  const stories: MochiStory[] = []

  for (const fn of exportedFns) {
    if (HOOK_NAMES.includes(fn.name as HookName)) {
      hooks[fn.name as HookName] = true
      continue
    }

    const fnIndex = body.indexOf(fn.node)
    const gapStart = fnIndex > 0 ? ends[fnIndex - 1] : 0

    const description = findLeadingComment(comments, fn.node.start, gapStart)
    const expected = extractExpected(comments, fn.bodyNode)

    const returnEnd = findLastReturnEnd(fn.bodyNode)
    const storyBody = returnEnd
      ? stripExpectedFromBody(source, fn.bodyNode, returnEnd)
      : extractBody(source, fn.bodyNode)

    stories.push({
      name: fn.name,
      description,
      body: storyBody,
      expected,
    })
  }

  const globals: MochiGlobal[] = topLevelVars.map((v) => ({
    name: v.name,
    body: extractSource(source, v.node),
  }))

  return {
    path: filePath,
    globals,
    hooks,
    stories,
  }
}
