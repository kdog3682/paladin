// @paladin/squire/src/commands/watch-commands.ts

import { collectSrc, discover } from "../utils/files"
// import { cacheDeps } from "../shell/deps"
import type { Command } from "../handler"
import type { FileKind } from "../utils/files"

function createRunCommand(kind: FileKind): Command {
  return {
    name: kind,
    args: "[filters...]",
    description: `run ${kind} files. optional filters to narrow matches`,
    requiresPkg: true,
    handler: async ({ tokens }, ctx) => {
      const filters = tokens.length ? tokens : undefined
      const pkgDir = ctx.state.pkgDir!

      // const deps = await cacheDeps(pkgDir)
      // ctx.reporter.info(`cached ${deps.length} external deps`)

      const files = await collectSrc(pkgDir)
      const matched = discover(files, kind, filters)

      if (kind === "test") await ctx.runner.runTests(matched)
      else if (kind === "demo") await ctx.runner.runDemos(matched)
      else if (kind === "mochi") await ctx.runner.runMochi(matched)
    },
  }
}

export const testCommand = createRunCommand("test")
export const demoCommand = createRunCommand("demo")
export const mochiCommand = createRunCommand("mochi")
