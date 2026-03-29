// @paladin/squire/src/commands/restart.ts

import type { Command } from "../handler"

export const restartCommand: Command = {
  name: "restart",
  description: "soft reload — re-init package and reset state",
  requiresPkg: false,
  handler: async (_args, ctx) => {
    ctx.reporter.info("restarting...")
    return "restart"
  },
}
