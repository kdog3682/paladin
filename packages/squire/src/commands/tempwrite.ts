// @paladin/squire/src/commands/tempwrite.ts

import type { Command } from "../handler"

export const tempwriteCommand: Command = {
  name: "tempwrite",
  description: "toggle output capture to file (opens in browser)",
  hints: ["tempwrite routes demo/test stdout to ~/.cache/paladin/squire/tempwrite.txt"],
  requiresPkg: false,
  handler: async (_args, ctx) => {
    if (!ctx.tempWriter) {
      ctx.reporter.warn("tempwrite not available")
      return
    }
    const active = ctx.tempWriter.toggle()
    if (active) {
      ctx.reporter.success(`tempwrite on — output writes to ${ctx.tempWriter.filePath}`)
      await ctx.tempWriter.openInBrowser()
    } else {
      ctx.reporter.info("tempwrite off")
    }
  },
}
