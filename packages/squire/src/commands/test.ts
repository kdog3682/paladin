// @paladin/squire/src/commands/test.ts

import { createWatcher } from "./watch"
import type { Command } from "../handler"

export const testCommand: Command = {
  name: "test",
  args: "[pattern|off]",
  description: "toggle test watcher (optional file filter)",
  hints: ["test abc matches test files containing 'abc' in the filename"],
  requiresPkg: true,
  handler: async (args, ctx) => {
    if (args[0] === "off") {
      ctx.state.test = false
      ctx.state.testPattern = undefined
      if (!ctx.state.demo && !ctx.state.test) {
        ctx.watcher?.stop()
        ctx.watcher = null
      }
      ctx.reporter.info("test watcher off")
      return
    }

    ctx.state.test = true
    ctx.state.testPattern = args[0] || undefined
    if (!ctx.watcher?.active && ctx.state.pkgDir) {
      ctx.watcher = createWatcher(ctx.state.pkgDir, ctx.runner, ctx.reporter, () => ({
        demo: ctx.state.demo,
        test: ctx.state.test,
        testPattern: ctx.state.testPattern,
      }))
      ctx.watcher.start()
    }
    ctx.reporter.success(`test watcher on${ctx.state.testPattern ? ` (filter: ${ctx.state.testPattern})` : ""}`)
  },
}
