// @paladin/squire/src/commands/commit.ts

import { nextCommitMessage } from "../core/version"
import type { Command } from "../handler"

export const commitCommand: Command = {
  name: "commit",
  args: "[message]",
  description: "commit current package (auto-increments version)",
  hints: ["messages are auto-formatted as wip(<pkg>): v<n> -- <message>"],
  requiresPkg: true,
  handler: async (args, ctx) => {
    const message = args.join(" ") || undefined
    const history = await ctx.git.wipHistory(ctx.state.pkg!)
    const commitMsg = nextCommitMessage(history, ctx.state.pkg!, message)

    await ctx.git.add([ctx.state.pkgDir!])
    await ctx.git.commit(commitMsg)

    ctx.reporter.success(commitMsg)
  },
}
