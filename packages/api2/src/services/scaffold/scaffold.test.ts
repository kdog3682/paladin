import { afterAll, expect, test } from "bun:test"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { isBash, isWrite } from "./ops"
import { ScaffoldService } from "./scaffold"
import type { ApplyResult } from "./types"

const base = mkdtempSync(join(tmpdir(), "scaffold-"))
const scaffold = new ScaffoldService({ pathResolution: { base }, emit: () => {} })

afterAll(() => rmSync(base, { recursive: true, force: true }))

// two files, one importing the other, so the runner has something to trace
const source = `
// @demo/widget/src/add.ts
export const add = (a: number, b: number) => a + b

// @demo/widget/src/test/add.test.ts
import { expect, test } from "bun:test"
import { add } from "../add"

test("add sums", () => {
  expect(add(2, 3)).toBe(5)
})
`

const writes = (result: ApplyResult) => result.filter(isWrite)
const commands = (result: ApplyResult) => result.filter(isBash)
const find = (result: ApplyResult, suffix: string) =>
  writes(result).find((op) => op.path.endsWith(suffix))

let barrelPath = ""

test("writes the unit, exports it, and runs its tests", async () => {
  const result = (await scaffold.process(source))!

  const add = find(result, "src/add.ts")
  expect(add?.applied).toBe(true)

  // updateBarrel appended an export for the new module
  const barrel = find(result, "src/index.ts")!
  barrelPath = barrel.path
  expect(barrel.mode).toBe("append")
  expect(readFileSync(barrelPath, "utf8")).toContain('export * from "./add"')

  // the runner turned the test file into a command, and apply ran it
  const spec = find(result, "add.test.ts")!
  const run = commands(result).find((op) => op.purpose === "test")!
  expect(run.args).toEqual(["bun", "test", spec.path])
  expect(run.result?.exitCode).toBe(0)

  // one op per path — nothing was written twice
  const paths = writes(result).map((op) => op.path)
  expect(new Set(paths).size).toBe(paths.length)
})

test("second pass touches nothing but still runs the tests", async () => {
  const result = (await scaffold.process(source))!

  // identical input, so the source files come back as skips
  expect(find(result, "src/add.ts")).toBeUndefined()
  expect(result.some((op) => op.kind === "skip" && op.path.endsWith("src/add.ts"))).toBe(true)

  // the barrel isn't appended to a second time
  const barrel = readFileSync(barrelPath, "utf8").split("\n")
  expect(barrel.filter((line) => line.includes('"./add"'))).toHaveLength(1)

  // unchanged files still get their tests run
  expect(commands(result).find((op) => op.purpose === "test")?.result?.exitCode).toBe(0)
})
