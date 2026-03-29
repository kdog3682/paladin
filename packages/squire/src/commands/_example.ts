// @paladin/squire/src/commands/_example.ts
// reference command — not registered, demonstrates full ctx surface

import { join, basename } from "path"
import type { Command } from "../handler"

export const exampleCommand: Command = {
  name: "example",
  description: "reference implementation showing all ctx features",
  requiresPkg: true, // guarantees ctx.state.pkgDir is non-null
  handler: async (args, ctx) => {
    // --- args ---
    // string after command name, may be undefined
    const input = args && typeof args === "string" && args.trim()

    // --- reporter ---
    ctx.reporter.header("example")
    ctx.reporter.info(`package: ${ctx.state.pkg}`)
    ctx.reporter.success(`dir: ${ctx.state.pkgDir}`)
    ctx.reporter.warn("this is a warning")
    ctx.reporter.error("this is an error")
    ctx.reporter.blank()

    // --- glob files ---
    const glob = new Bun.Glob("**/*.ts")
    const files: string[] = []
    for await (const match of glob.scan({ cwd: ctx.state.pkgDir!, onlyFiles: true })) {
      files.push(match)
    }
    ctx.reporter.info(`found ${files.length} files`)

    // --- shell ---
    const proc = Bun.spawn(["echo", "hello from shell"], {
      cwd: ctx.state.pkgDir ?? ctx.root,
      stdout: "inherit",
      stderr: "inherit",
    })
    await proc.exited

    // --- runner ---
    // ctx.runner.runDemo(absolutePath)
    // ctx.runner.runTests([absolutePaths], ctx.state.pkgDir)

    // --- switch package ---
    // const selected = await ctx.onSetPkg("other-pkg") // by name
    // const selected = await ctx.onSetPkg()            // interactive picker
    // if (selected) {
    //   ctx.state.pkg = selected.name
    //   ctx.state.pkgDir = selected.dir
    // }

    // --- git ---
    // await ctx.git.commit("msg")
    // await ctx.git.revert()
    // const status = await ctx.git.status()

    // --- tempwriter ---
    // if (ctx.tempWriter.active) {
    //   await ctx.tempWriter.clear()
    //   await ctx.tempWriter.append("output")
    // }

    // --- state flags ---
    // ctx.state.demo = true
    // ctx.state.test = true

    // --- return values ---
    // return          — continue loop (default)
    // return "exit"   — quit squire
    // return "restart" — re-init, re-pick package
  },
}
