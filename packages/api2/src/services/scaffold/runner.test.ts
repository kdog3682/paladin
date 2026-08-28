import { beforeEach, describe, expect, mock, test } from "bun:test"
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import type { File } from "./types"

const actual = await import("@paladin/utils")

const runs: string[][] = []

mock.module("@paladin/utils", () => ({
  ...actual,
  bash: async (args: string[]) => {
    runs.push(args)
    return { stdout: "", stderr: "", exitCode: 0, args }
  },
}))

const { CodeRunner } = await import("./runner")

const root = mkdtempSync(join(tmpdir(), "runner-test-"))

function P(path: string): string {
  return join(root, path)
}

function file(path: string, status: File["status"], content = ""): File {
  const abs = P(path)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, content)
  return { path: abs, status, content }
}

beforeEach(() => {
  runs.length = 0
})

describe("CodeRunner", () => {
  test("runs a runnable file, changed or not", async () => {
    const runner = new CodeRunner()
    const results = await runner.run([
      file("/p/src/a.test.ts", "created"),
      file("/p/src/b.test.ts", "unchanged"),
    ])

    expect(results.map((result) => result.path)).toEqual([P("/p/src/a.test.ts"), P("/p/src/b.test.ts")])
    expect(results.every((result) => result.ok)).toBe(true)
    expect(runs).toEqual([
      ["bun", "test", P("/p/src/a.test.ts")],
      ["bun", "test", P("/p/src/b.test.ts")],
    ])
  })

  test("ignores source files that are unchanged or unknown", async () => {
    const runner = new CodeRunner()
    const results = await runner.run([
      file("/p/src/a.ts", "unchanged"),
      file("/p/src/never-indexed.ts", "modified"),
    ])

    expect(results).toEqual([])
    expect(runs).toEqual([])
  })

  test("reruns the runnable that imports a changed source file", async () => {
    const runner = new CodeRunner()
    file("/p/src/a.ts", "unchanged")
    await runner.run([file("/p/src/a.test.ts", "created", 'import { a } from "./a"')])
    runs.length = 0

    const results = await runner.run([file("/p/src/a.ts", "modified")])

    expect(results.map((result) => result.path)).toEqual([P("/p/src/a.test.ts")])
    expect(runs).toEqual([["bun", "test", P("/p/src/a.test.ts")]])
  })

  test("drops imports that a reindexed runnable no longer has", async () => {
    const runner = new CodeRunner()
    file("/p/src/a.ts", "unchanged")
    file("/p/src/b.ts", "unchanged")
    await runner.run([file("/p/src/a.test.ts", "created", 'import { a } from "./a"')])
    await runner.run([file("/p/src/a.test.ts", "modified", 'import { b } from "./b"')])
    runs.length = 0

    const results = await runner.run([file("/p/src/a.ts", "modified")])

    expect(results).toEqual([])
  })

  test("ignores package imports when indexing", async () => {
    const runner = new CodeRunner()
    await runner.run([file("/p/src/a.test.ts", "created", 'import { Hono } from "hono"')])
    runs.length = 0

    const results = await runner.run([file("/p/src/hono.ts", "modified")])

    expect(results).toEqual([])
  })

  test("skips by basename or path suffix", async () => {
    const runner = new CodeRunner()
    const results = await runner.run(
      [file("/p/src/a.test.ts", "created"), file("/p/src/b.test.ts", "created")],
      { skip: ["a.test.ts"] },
    )

    expect(results.map((result) => result.path)).toEqual([P("/p/src/b.test.ts")])
  })

  test("a later registration wins only when kind and ext both match", async () => {
    const runner = new CodeRunner()
    runner.register({ matches: { kind: "test", ext: "ts" }, command: "vitest <path>" })

    await runner.run([file("/p/src/a.test.ts", "created"), file("/p/src/b.test.tsx", "created")])

    expect(runs).toEqual([
      ["vitest", P("/p/src/a.test.ts")],
      ["bun", "test", P("/p/src/b.test.tsx")],
    ])
  })

  test("reports a failing run without throwing", async () => {
    const runner = new CodeRunner()
    runner.register({
      matches: { kind: "script" },
      handler: async () => ({ stdout: "", stderr: "boom\n", exitCode: 1, args: [] }),
    })

    const [result] = await runner.run([file("/p/src/a.script.ts", "created")])

    expect(result?.ok).toBe(false)
    expect(result?.error).toBe("boom")
  })

  test("reports a thrown handler as a failed result", async () => {
    const runner = new CodeRunner()
    runner.register({
      matches: { kind: "demo" },
      handler: async () => {
        throw new Error("nope")
      },
    })

    const [result] = await runner.run([file("/p/src/a.demo.ts", "created")])

    expect(result?.ok).toBe(false)
    expect(result?.error).toBe("nope")
  })
})
