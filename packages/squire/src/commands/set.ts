// @paladin/squire/src/commands/set.ts
import { setDefaultPkg } from "../config"
import type { Command } from "../handler"

export const setCommand: Command = {
  name: "set",
  args: "[name|default]",
  description: "change active package, or 'set default' to save current as default",
  requiresPkg: false,
  handler: async ({ tokens }, ctx) => {
    if (tokens[0] === "default") {
      if (!ctx.state.pkg || !ctx.state.pkgDir) {
        ctx.reporter.error("no package set — use 'set <name>' first")
        return
      }
      await setDefaultPkg(ctx.root, ctx.state.pkg, ctx.state.pkgDir)
      ctx.reporter.success(`saved ${ctx.state.pkg} as default`)
      return
    }

    ctx.watcher?.stop()
    ctx.watcher = null
    ctx.state.demo = false
    ctx.state.test = false
    ctx.state.testPattern = undefined

    if (ctx.onSetPkg) {
      const selected = await ctx.onSetPkg(tokens[0])
      if (selected) {
        ctx.state.pkg = selected.name
        ctx.state.pkgDir = selected.dir
        ctx.reporter.success(`switched to ${ctx.state.pkg}`)
      }
    }
  },
}