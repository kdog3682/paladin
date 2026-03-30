// @paladin/squire/src/commands/watch-commands.ts

import { PkgWatcher, type WatchState } from "../shell/watcher"
import type { Command } from "../handler"
import type { FileKind } from "../utils/files"

function createWatchCommand(kind: FileKind): Command {
  return {
    name: kind,
    args: "[filters...|off]",
    description: `toggle ${kind} watcher. optional filters to narrow files`,
    requiresPkg: true,
    handler: async ({ tokens }, ctx) => {
      if (tokens[0] === "off") {
        ctx.state[kind] = false
        if (!ctx.state.demo && !ctx.state.test && !ctx.state.mochi) {
          ctx.watcher?.stop()
          ctx.watcher = null
        }
        ctx.reporter.info(`${kind} watcher off`)
        return
      }

      ctx.state[kind] = true
      const filters = tokens.length ? tokens : undefined

      if (!ctx.watcher?.active && ctx.state.pkgDir) {
        ctx.watcher = new PkgWatcher(ctx.state.pkgDir, ctx.runner, ctx.reporter, () => ({
          demo: ctx.state.demo,
          test: ctx.state.test,
          mochi: ctx.state.mochi,
        }))
        ctx.watcher.start()
      }

      const stateOverride: WatchState = { demo: false, test: false, mochi: false, [kind]: true }
      ctx.reporter.success(`${kind} watcher on${filters ? ` (filters: ${filters.join(", ")})` : ""}`)
      await ctx.watcher!.runNow(stateOverride, filters)
    },
  }
}

export const testCommand = createWatchCommand("test")
export const demoCommand = createWatchCommand("demo")
export const mochiCommand = createWatchCommand("mochi")
