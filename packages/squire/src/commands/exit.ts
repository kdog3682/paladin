// @paladin/squire/src/commands/exit.ts

import type { Command } from "../handler"

export const exitCommand: Command = {
  name: "exit",
  aliases: ["quit", "q"],
  description: "quit squire",
  requiresPkg: false,
  handler: async (_args, ctx) => {
    ctx.watcher?.stop()
    ctx.reporter.info("bye")
    return "exit"
  },
}
