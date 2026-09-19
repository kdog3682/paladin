import { afterAll, describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { CodeRunner } from "./runner"
import { skip, write } from "./ops"
import type { BashOp } from "./types"

const cwd = "/p"

/** import resolution reads the disk, so files that get imported must really exist */
const root = mkdtempSync(join(tmpdir(), "runner-test-"))
afterAll(() => rmSync(root, { recursive: true, force: true }))

function real(rel: string): string {
  const path = join(root, rel)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, "")
  return path
}

const w = (path: string, content = "") => write("test", path, content)
const s = (path: string, content = "") => skip("test", path, "unchanged", content)
const argsOf = (ops: BashOp[]) => ops.map((op) => op.args)

describe("CodeRunner", () => {
  test("runs a runnable whether it was written or skipped, in one grouped command", () => {
    const ops = new CodeRunner().run([w("/p/src/a.test.ts"), s("/p/src/b.test.ts")], { cwd })

    expect(argsOf(ops)).toEqual([["bun", "test", "/p/src/a.test.ts", "/p/src/b.test.ts"]])
    expect(ops[0]).toMatchObject({ kind: "bash", cwd, purpose: "test", strict: false, source: "codeRunner" })
  })

  test("ignores source files that are skipped or unknown", () => {
    const ops = new CodeRunner().run([s("/p/src/a.ts"), w("/p/src/never-indexed.ts")], { cwd })
    expect(ops).toEqual([])
  })

  test("reruns the runnable that imports a written source file", () => {
    const [a, test] = [real("src/a.ts"), join(root, "src/a.test.ts")]
    const runner = new CodeRunner()
    runner.run([w(test, 'import { a } from "./a"')], { cwd })

    const ops = runner.run([w(a)], { cwd })

    expect(argsOf(ops)).toEqual([["bun", "test", test]])
  })

  test("a skipped source file does not drag in its importers", () => {
    const [a, test] = [real("src/a.ts"), join(root, "src/a.test.ts")]
    const runner = new CodeRunner()
    runner.run([w(test, 'import { a } from "./a"')], { cwd })

    expect(runner.run([s(a)], { cwd })).toEqual([])
  })

  test("drops imports that a rewritten runnable no longer has", () => {
    const [a, b, test] = [real("src/a.ts"), real("src/b.ts"), join(root, "src/a.test.ts")]
    const runner = new CodeRunner()
    runner.run([w(test, 'import { a } from "./a"')], { cwd })
    runner.run([w(test, 'import { b } from "./b"')], { cwd })

    expect(runner.run([w(a)], { cwd })).toEqual([])
    expect(argsOf(runner.run([w(b)], { cwd }))).toEqual([["bun", "test", test]])
  })

  test("ignores package imports when indexing", () => {
    const runner = new CodeRunner()
    const hono = real("src/hono.ts")
    runner.run([w("/p/src/a.test.ts", 'import { Hono } from "hono"')], { cwd })

    expect(runner.run([w(hono)], { cwd })).toEqual([])
  })

  test("disabled ids are left out", () => {
    const ops = new CodeRunner().run([w("/p/src/a.test.ts")], { cwd, disabled: ["test-ts"] })
    expect(ops).toEqual([])
  })

  test("a registration with enabled: false never matches", () => {
    const runner = new CodeRunner([
      { id: "test-ts", matches: { kind: "test" }, command: "bun test", enabled: false },
    ])
    expect(runner.run([w("/p/src/a.test.ts")], { cwd })).toEqual([])
  })

  test("a later registration wins only when kind and ext both match", () => {
    const runner = new CodeRunner().register({
      matches: { kind: "test", ext: "ts" },
      command: "vitest",
    })

    const ops = runner.run([w("/p/src/a.test.ts"), w("/p/src/b.test.tsx")], { cwd })

    expect(argsOf(ops)).toEqual([
      ["vitest", "/p/src/a.test.ts"],
      ["bun", "test", "--preload", "./happydom.ts", "/p/src/b.test.tsx"],
    ])
  })

  test("registering an id again replaces the earlier registration", () => {
    const runner = new CodeRunner().register({
      id: "test-ts",
      matches: { kind: "test", ext: "ts" },
      command: "vitest",
      grouped: true,
    })

    expect(argsOf(runner.run([w("/p/src/a.test.ts")], { cwd }))).toEqual([["vitest", "/p/src/a.test.ts"]])
  })

  test("<paths> places the paths, options are appended only when accepted", () => {
    const runner = new CodeRunner([
      {
        id: "lint",
        matches: { kind: "test" },
        command: "lint <paths> --fix",
        acceptsOptions: true,
        options: { a: 1 },
      },
    ])

    const ops = runner.run([w("/p/src/a.test.ts")], { cwd, scopedRunOptions: { lint: { b: 2 } } })

    expect(argsOf(ops)).toEqual([["lint", "/p/src/a.test.ts", "--fix", "--opts", '{"a":1,"b":2}']])
  })

  test("@owner/pkg tokens resolve to the package's directory", () => {
    const ops = new CodeRunner().run([w("/x/packages/recast/src/specs/rename.ts")], {
      cwd,
      pathResolution: { base: "/base" },
    })

    expect(ops).toHaveLength(1)
    expect(ops[0]!.args.slice(0, 2)).toEqual(["bun", "run"])
    expect(ops[0]!.args[2]).toBe("/base/paladin/packages/recast/src/runner.ts")
    expect(ops[0]!.args[3]).toBe("/x/packages/recast/src/specs/rename.ts")
    expect(ops[0]!.purpose).toBe("script")
  })

  test("App.tsx runs through webrun", () => {
    const ops = new CodeRunner().run([w("/p/src/App.tsx")], { cwd, pathResolution: { base: "/base" } })

    expect(ops).toHaveLength(1)
    expect(ops[0]!.args.slice(0, 2)).toEqual(["bun", "run"])
    expect(ops[0]!.args[2]).toEndWith("/webrun/src/cli.ts")
    expect(ops[0]!.args[3]).toBe("/p/src/App.tsx")
  })

  test("a package with a test script runs it instead of its test files", () => {
    const manifest = JSON.stringify({ scripts: { test: "bun test --bail" } })

    const ops = new CodeRunner().run(
      [w("/p/packages/a/package.json", manifest), w("/p/packages/a/src/x.test.ts")],
      { cwd },
    )

    expect(ops).toHaveLength(1)
    expect(ops[0]).toMatchObject({ args: ["bun", "run", "test"], cwd: "/p/packages/a", purpose: "test" })
  })
})
