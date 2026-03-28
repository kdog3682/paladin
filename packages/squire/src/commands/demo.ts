// @paladin/squire/src/commands/demo.ts

import { createWatcher } from "./watch"
import type { Command } from "../handler"

export const demoCommand: Command = {
  name: "demo",
  args: "[off]",
  description: "toggle demo watcher (runs .demo.ts on change)",
  hints: ["demo watches for file changes and runs .demo.ts automatically"],
  requiresPkg: true,
  handler: async (args, ctx) => {
    if (args[0] === "off") {
      ctx.state.demo = false
      if (!ctx.state.demo && !ctx.state.test) {
        ctx.watcher?.stop()
        ctx.watcher = null
      }
      ctx.reporter.info("demo watcher off")
      return
    }

    ctx.state.demo = true
    if (!ctx.watcher?.active && ctx.state.pkgDir) {
      ctx.watcher = createWatcher(ctx.state.pkgDir, ctx.runner, ctx.reporter, () => ({
        demo: ctx.state.demo,
        test: ctx.state.test,
        testPattern: ctx.state.testPattern,
      }))
      ctx.watcher.start()
    }
    ctx.reporter.success("demo watcher on — watching for changes")
  },
}
