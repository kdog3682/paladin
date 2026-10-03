import { afterAll, expect, test } from "bun:test"
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { isBash, isWrite } from "./ops"
import { ScaffoldService } from "./scaffold"
import type { ApplyResult } from "./types"

const base = mkdtempSync(join(tmpdir(), "scaffold-"))
const scaffold = new ScaffoldService({
  pathResolution: { base },
  emit: () => {},
  postProcessorOptions: { updateBarrel: {} },
})

afterAll(() => rmSync(base, { recursive: true, force: true }))

const source = `
// @acme/widget/src/add.ts
export const add = (a: number, b: number) => a + b

// @acme/widget/src/test/add.test.ts
import { expect, test } from "bun:test"
import { add } from "../add"

test("add sums", () => {
  expect(add(2, 3)).toBe(5)
})
`

/** Every op of the result, paired with its unit — paths are relative to the unit's dir. */
const all = (result: ApplyResult) => result.units.flatMap((unit) => unit.ops.map((op) => ({ unit, op })))
const writes = (result: ApplyResult) => all(result).filter((entry) => isWrite(entry.op))
const commands = (result: ApplyResult) => all(result).map((entry) => entry.op).filter(isBash)
const find = (result: ApplyResult, suffix: string) =>
  all(result)
    .map((entry) => entry.op)
    .filter(isWrite)
    .find((op) => op.path.endsWith(suffix))

const unitDir = join(base, "acme", "packages", "widget")

test("writes the unit, exports it, and runs its tests", async () => {
  const result = (await scaffold.process(source))!

  expect(result.name).toBe("acme")
  expect(result.isNew).toBe(true)
  expect(result.units.map((unit) => unit.dir)).toEqual([unitDir])

  expect(find(result, "src/add.ts")?.applied).toBe(true)

  // updateBarrel appended an export for the new module
  const barrel = find(result, "src/index.ts")!
  expect(barrel.mode).toBe("append")
  expect(readFileSync(join(unitDir, "src/index.ts"), "utf8")).toContain('export * from "./add"')

  // hydrateBoilerplate laid down the new unit's manifest
  expect(find(result, "package.json")?.applied).toBe(true)

  // the runner turned the test file into a command, and apply ran it
  const run = commands(result).find((op) => op.purpose === "test")!
  expect(run.args.slice(0, 2)).toEqual(["bun", "test"])
  expect(run.args).toContain(join(unitDir, "src/test/add.test.ts"))
  expect(run.exitCode).toBe(0)

  // one op per path — nothing was written twice
  const paths = writes(result).map((entry) => entry.op).filter(isWrite).map((op) => op.path)
  expect(new Set(paths).size).toBe(paths.length)
})

test("second pass writes nothing but still runs the tests", async () => {
  const result = (await scaffold.process(source))!

  // identical input: the files come back as skips, which never reach the result
  expect(find(result, "src/add.ts")).toBeUndefined()
  expect(writes(result)).toEqual([])
  expect(result.summary).toMatchObject({ created: 0, updated: 0, failed: 0 })

  // the barrel isn't appended to a second time
  const barrel = readFileSync(join(unitDir, "src/index.ts"), "utf8").split("\n")
  expect(barrel.filter((line) => line.includes('"./add"'))).toHaveLength(1)

  // unchanged files still get their tests run
  expect(commands(result).find((op) => op.purpose === "test")?.exitCode).toBe(0)
})

test("fixtures are written as-is, without barrel, boilerplate, deps or runs", async () => {
  const result = (await scaffold.process(`
// @acme/gadget/src/test/fixtures/sample.test.ts
import { nope } from "not-a-real-dep"
test("would fail", () => {})

// @acme/gadget/src/thing.fixture.ts
export const thing = 1
`))!

  const dir = join(base, "acme", "packages", "gadget")
  expect(readFileSync(join(dir, "src/test/fixtures/sample.test.ts"), "utf8")).toContain("not-a-real-dep")
  expect(readFileSync(join(dir, "src/thing.fixture.ts"), "utf8")).toContain("thing")
  expect(existsSync(join(dir, "package.json"))).toBe(false)
  expect(existsSync(join(dir, "src/index.ts"))).toBe(false)
  expect(commands(result)).toEqual([])
})

test("clears the scratch dir every `clearAfter` runs", async () => {
  const dir = mkdtempSync(join(tmpdir(), "scaffold-scratch-"))
  const service = new ScaffoldService({
    pathResolution: { base },
    emit: () => {},
    postProcessorOptions: { updateBarrel: {} },
    scratch: { dir, clearAfter: 2 },
  })
  const notes = "<!-- @acme/notes/notes.md -->\n# notes\n"
  writeFileSync(join(dir, "a.txt"), "a")
  mkdirSync(join(dir, "sub"))

  await service.process(notes)
  expect(readdirSync(dir).sort()).toEqual(["a.txt", "sub"])

  await service.process(notes)
  expect(readdirSync(dir)).toEqual([])
  expect(existsSync(dir)).toBe(true)

  writeFileSync(join(dir, "b.txt"), "b")
  await service.process(notes)
  expect(readdirSync(dir)).toEqual(["b.txt"])

  rmSync(dir, { recursive: true, force: true })
})
