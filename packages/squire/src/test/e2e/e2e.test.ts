// @paladin/squire/src/test/e2e/e2e.test.ts

import { describe, expect, test, beforeAll, afterAll } from "bun:test"
import { join } from "path"
import { mkdirSync, rmSync } from "fs"
import { GitOps } from "../../shell/git"
import { Runner } from "../../shell/runner"
import { TempWriter } from "../../shell/tempwriter"
import { CapturedReporter } from "../../shell/captured-reporter"
import { createHandler, type AppState, type HandlerContext } from "../../handler"
import { commitCommand } from "../../commands/commit"
import { revertCommand } from "../../commands/revert"
import { statusCommand } from "../../commands/status"
import { setCommand } from "../../commands/set"
import { exitCommand } from "../../commands/exit"

const TMP = join(import.meta.dir, ".tmp-e2e")
const PKG_A = join(TMP, "packages", "alpha")
const PKG_B = join(TMP, "packages", "beta")

async function git(args: string[]) {
  const proc = Bun.spawn(["git", ...args], { cwd: TMP, stdout: "pipe", stderr: "pipe" })
  await proc.exited
}

function makeCtx(reporter: CapturedReporter, state: AppState): { ctx: HandlerContext, handle: ReturnType<typeof createHandler> } {
  const gitOps = new GitOps(TMP)
  const tempWriter = new TempWriter(reporter)
  const runner = new Runner(TMP, reporter, tempWriter)

  const commands = [
    commitCommand,
    revertCommand,
    statusCommand,
    setCommand,
    exitCommand,
  ]

  const handle = createHandler(commands)

  const ctx: HandlerContext = {
    git: gitOps,
    reporter,
    runner,
    tempWriter,
    state,
    watcher: null,
    onSetPkg: async () => ({ name: "beta", dir: PKG_B }),
  }

  return { ctx, handle }
}

beforeAll(async () => {
  mkdirSync(PKG_A, { recursive: true })
  mkdirSync(PKG_B, { recursive: true })
  await git(["init"])
  await git(["config", "user.email", "e2e@test.com"])
  await git(["config", "user.name", "e2e"])

  await Bun.write(join(PKG_A, "package.json"), JSON.stringify({ name: "@paladin/alpha" }))
  await Bun.write(join(PKG_A, "index.ts"), "export const a = 1")
  await Bun.write(join(PKG_B, "package.json"), JSON.stringify({ name: "@paladin/beta" }))
  await Bun.write(join(PKG_B, "index.ts"), "export const b = 1")
  await git(["add", "."])
  await git(["commit", "-m", "init"])
})

afterAll(() => {
  rmSync(TMP, { recursive: true, force: true })
})

describe("e2e: commit → status → revert → set", () => {
  const reporter = new CapturedReporter()
  const state: AppState = { pkg: "alpha", pkgDir: PKG_A, demo: false, test: false }
  let ctx: HandlerContext
  let handle: ReturnType<typeof createHandler>

  beforeAll(() => {
    const result = makeCtx(reporter, state)
    ctx = result.ctx
    handle = result.handle
  })

  test("commit creates v1 with message", async () => {
    await Bun.write(join(PKG_A, "index.ts"), "export const a = 2")
    reporter.clear()

    await handle("commit refactored exports", ctx)

    expect(reporter.has("success", "wip(alpha): v1 -- refactored exports")).toBe(true)
  })

  test("commit increments to v2", async () => {
    await Bun.write(join(PKG_A, "index.ts"), "export const a = 3")
    reporter.clear()

    await handle("commit", ctx)

    expect(reporter.has("success", "wip(alpha): v2")).toBe(true)
  })

  test("status shows v2 and package info", async () => {
    reporter.clear()

    await handle("status", ctx)

    const entry = reporter.last("status")
    expect(entry?.state?.pkg).toBe("alpha")
    expect(entry?.state?.latestVersion).toBe(2)
  })

  test("revert by query restores v1 content", async () => {
    reporter.clear()

    await handle("revert refactored", ctx)

    expect(reporter.has("success", "restored alpha to v1")).toBe(true)
    const content = await Bun.file(join(PKG_A, "index.ts")).text()
    expect(content).toBe("export const a = 2")
  })

  test("set switches to beta", async () => {
    reporter.clear()

    await handle("set", ctx)

    expect(reporter.has("success", "switched to beta")).toBe(true)
    expect(ctx.state.pkg).toBe("beta")
    expect(ctx.state.pkgDir).toBe(PKG_B)
  })

  test("commands fail gracefully with no pkg", async () => {
    ctx.state.pkg = null
    ctx.state.pkgDir = null
    reporter.clear()

    await handle("commit oops", ctx)

    expect(reporter.has("error", "no package set")).toBe(true)
  })

  test("unknown command warns", async () => {
    reporter.clear()

    await handle("foobar", ctx)

    expect(reporter.has("warn", "unknown: foobar")).toBe(true)
  })

  test("exit returns exit signal", async () => {
    reporter.clear()

    const result = await handle("exit", ctx)

    expect(result).toBe("exit")
    expect(reporter.has("info", "bye")).toBe(true)
  })
})
