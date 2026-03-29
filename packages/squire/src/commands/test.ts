// @paladin/squire/src/commands/test.ts
import { createWatcher, runNow } from "./watch"
import type { Command } from "../handler"

export const testCommand: Command = {
  name: "test",
  args: "[pattern|off]",
  description: "toggle test watcher. optional pattern to filter test files",
  requiresPkg: true,
  handler: async ({ tokens }, ctx) => {
    if (tokens[0] === "off") {
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
    ctx.state.testPattern = tokens[0] || undefined

    if (!ctx.watcher?.active && ctx.state.pkgDir) {
      ctx.watcher = createWatcher(ctx.state.pkgDir, ctx.runner, ctx.reporter, () => ({
        demo: ctx.state.demo,
        test: ctx.state.test,
        testPattern: ctx.state.testPattern,
      }))
      ctx.watcher.start()
    }

    ctx.reporter.success(`test watcher on${ctx.state.testPattern ? ` (pattern: ${ctx.state.testPattern})` : ""}`)
    await runNow(ctx.state.pkgDir!, ctx.runner, ctx.reporter, {
      demo: false,
      test: true,
      testPattern: ctx.state.testPattern,
    })
  },
}