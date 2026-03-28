// @paladin/squire/src/commands/status.ts

import { buildStatus } from "../core/status"
import type { Command } from "../handler"

export const statusCommand: Command = {
  name: "status",
  description: "show package state, watchers, dirty files",
  requiresPkg: true,
  handler: async (_args, ctx) => {
    const history = await ctx.git.wipHistory(ctx.state.pkg!)
    const dirtyFiles = await ctx.git.dirtyFiles([ctx.state.pkgDir!])
    const status = buildStatus(ctx.state.pkg!, ctx.state.pkgDir!, history, {
      demo: ctx.state.demo,
      test: ctx.state.test,
      testPattern: ctx.state.testPattern,
    }, dirtyFiles)
    ctx.reporter.status(status)
  },
}
