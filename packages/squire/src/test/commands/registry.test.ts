// @paladin/squire/src/test/commands/registry.test.ts

import { describe, expect, test } from "bun:test"
import { createHandler } from "../../handler"
import { CapturedReporter } from "../../shell/captured-reporter"
import { commitCommand } from "../../commands/commit"
import { revertCommand } from "../../commands/revert"
import { exitCommand } from "../../commands/exit"
import { helpCommand } from "../../commands/help"

describe("createHandler", () => {
  const commands = [commitCommand, revertCommand, exitCommand]
  const handle = createHandler(commands)

  test("resolves command by name", async () => {
    const reporter = new CapturedReporter()
    const ctx = {
      git: {} as any,
      reporter,
      runner: {} as any,
      state: { pkg: null, pkgDir: null, demo: false, test: false },
      watcher: null,
    }

    await handle("commit hello", ctx)
    expect(reporter.has("error", "no package set")).toBe(true)
  })

  test("resolves command by alias", async () => {
    const reporter = new CapturedReporter()
    const ctx = {
      git: {} as any,
      reporter,
      runner: {} as any,
      state: { pkg: null, pkgDir: null, demo: false, test: false },
      watcher: null,
    }

    const result = await handle("q", ctx)
    expect(result).toBe("exit")
  })

  test("warns on unknown command", async () => {
    const reporter = new CapturedReporter()
    const ctx = {
      git: {} as any,
      reporter,
      runner: {} as any,
      state: { pkg: null, pkgDir: null, demo: false, test: false },
      watcher: null,
    }

    await handle("nope", ctx)
    expect(reporter.has("warn", "unknown: nope")).toBe(true)
  })
})

describe("helpCommand", () => {
  test("generates help from registry", async () => {
    const commands = [commitCommand, revertCommand, exitCommand]
    commands.push(helpCommand(commands))
    const handle = createHandler(commands)

    const reporter = new CapturedReporter()
    const ctx = {
      git: {} as any,
      reporter,
      runner: {} as any,
      state: { pkg: null, pkgDir: null, demo: false, test: false },
      watcher: null,
    }

    await handle("help", ctx)

    expect(reporter.has("header", "squire — help")).toBe(true)
    expect(reporter.has("line", "commit")).toBe(true)
    expect(reporter.has("line", "revert")).toBe(true)
    expect(reporter.has("line", "exit")).toBe(true)
    expect(reporter.has("line", "auto-formatted")).toBe(true)
  })
})
