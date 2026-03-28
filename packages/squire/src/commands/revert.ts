// @paladin/squire/src/commands/revert.ts

import { findByQuery, findLatestForPkg } from "../core/search"
import type { Command } from "../handler"

export const revertCommand: Command = {
  name: "revert",
  args: "[query]",
  description: "restore to latest wip commit, or search by query",
  hints: [
    "revert with no args restores the latest commit for the package",
    "revert <query> searches commit messages for a substring match",
  ],
  requiresPkg: true,
  handler: async (args, ctx) => {
    const query = args.join(" ") || undefined
    const history = await ctx.git.wipHistory(ctx.state.pkg!)

    if (history.length === 0) {
      ctx.reporter.warn(`no wip commits found for ${ctx.state.pkg}`)
      return
    }

    const target = query
      ? findByQuery(history, query)
      : findLatestForPkg(history)

    if (!target || !target.hash) {
      ctx.reporter.error(query ? `no commit matching "${query}"` : "no commits found")
      return
    }

    await ctx.git.restore(target.hash, [ctx.state.pkgDir!])
    ctx.reporter.success(`restored ${ctx.state.pkg} to v${target.version}${target.message ? ` (${target.message})` : ""}`)
  },
}
