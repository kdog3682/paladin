// @paladin/api/src/utils/run-tests.ts

import { $ } from "bun"
import type { RunResult, RunSuite, RunCase } from "@paladin/types"

/**
 * Parses bun test --reporter=json output into RunResult.
 * Falls back to text parsing if JSON parsing fails.
 */
function parseJsonReporter(raw: string): Omit<RunResult, "success" | "rawOutput"> {
  const suites: RunSuite[] = []

  const lines = raw.trim().split("\n")
  for (const line of lines) {
    let data: Record<string, unknown>
    try {
      data = JSON.parse(line)
    } catch {
      continue
    }

    if (data.event === "suite:start") {
      suites.push({
        file: data.file as string,
        tests: [],
        duration: 0,
      })
    }

    if (data.event === "test:done") {
      const suite = suites.at(-1)
      if (!suite) continue

      const testCase: RunCase = {
        name: data.name as string,
        status: data.passed ? "pass" : data.skipped ? "skip" : "fail",
        duration: data.duration as number | undefined,
      }

      if (!data.passed && !data.skipped && data.error) {
        const err = data.error as Record<string, string>
        testCase.error = {
          message: err.message ?? "Unknown error",
          expected: err.expected,
          actual: err.actual,
          stack: err.stack,
        }
      }

      suite.tests.push(testCase)
    }

    if (data.event === "suite:done") {
      const suite = suites.at(-1)
      if (suite) {
        suite.duration = (data.duration as number) ?? suite.tests.reduce((s, t) => s + (t.duration ?? 0), 0)
      }
    }
  }

  let total = 0, passed = 0, failed = 0, skipped = 0, duration = 0
  for (const suite of suites) {
    for (const test of suite.tests) {
      total++
      if (test.status === "pass") passed++
      if (test.status === "fail") failed++
      if (test.status === "skip") skipped++
      duration += test.duration ?? 0
    }
  }

  return { suites, summary: { total, passed, failed, skipped, duration } }
}

export async function runTests(files: string[]): Promise<RunResult> {
  const { stdout, stderr, exitCode } = await $`bun test ${files} --reporter=json`.quiet()
  const rawOutput = stdout.toString() + stderr.toString()
  const parsed = parseJsonReporter(rawOutput)

  return {
    success: exitCode === 0,
    rawOutput,
    ...parsed,
  }
}
