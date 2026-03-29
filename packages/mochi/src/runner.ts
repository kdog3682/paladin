// @paladin/mochi/src/runner.ts

import { readFileSync } from "fs"
import { parseMochiSource } from "./parser"
import type { MochiSuite, MochiResult } from "./types"

/**
 * Runs mochi suites from a list of file paths.
 *
 * For each file:
 *   1. Parse into a suite (globals, hooks, stories)
 *   2. Dynamically evaluate the module to get callable functions
 *   3. Run hooks around each story, collecting results
 */
export async function mochi(files: string[]): Promise<MochiSuite[]> {
  const suites: MochiSuite[] = []

  for (const filePath of files) {
    const source = readFileSync(filePath, "utf-8")
    const parsed = parseMochiSource(source, filePath)

    const mod = await import(filePath)

    const beforeAll = parsed.hooks.beforeAll ? mod.beforeAll : null
    const beforeEach = parsed.hooks.beforeEach ? mod.beforeEach : null
    const afterEach = parsed.hooks.afterEach ? mod.afterEach : null
    const afterAll = parsed.hooks.afterAll ? mod.afterAll : null

    if (beforeAll) await invoke(beforeAll)

    const results: MochiResult[] = []

    for (const story of parsed.stories) {
      const fn = mod[story.name]

      if (beforeEach) await invoke(beforeEach)

      const result = await runStory(story.name, fn)
      results.push(result)

      if (afterEach) await invoke(afterEach)
    }

    if (afterAll) await invoke(afterAll)

    suites.push({ ...parsed, results })
  }

  return suites
}

async function runStory(name: string, fn: () => unknown): Promise<MochiResult> {
  const start = performance.now()
  try {
    const value = await fn()
    return {
      name,
      value,
      duration: performance.now() - start,
      error: null,
    }
  } catch (e) {
    return {
      name,
      value: undefined,
      duration: performance.now() - start,
      error: e instanceof Error ? e : new Error(String(e)),
    }
  }
}

async function invoke(fn: () => unknown): Promise<void> {
  await fn()
}
