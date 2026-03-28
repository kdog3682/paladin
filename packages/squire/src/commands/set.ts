// @paladin/squire/src/commands/set.ts

import type { Command } from "../handler"

export const setCommand: Command = {
  name: "set",
  description: "change active package",
  requiresPkg: false,
  handler: async (_args, ctx) => {
    ctx.watcher?.stop()
    ctx.watcher = null
    ctx.state.demo = false
    ctx.state.test = false
    ctx.state.testPattern = undefined

    if (ctx.onSetPkg) {
      const selected = await ctx.onSetPkg()
      if (selected) {
        ctx.state.pkg = selected.name
        ctx.state.pkgDir = selected.dir
        ctx.reporter.success(`switched to ${ctx.state.pkg}`)
      }
    }
  },
}
