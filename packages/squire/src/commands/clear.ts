// @paladin/squire/src/commands/clear.ts
import { clearDefaultPkg } from "../config"
import type { Command } from "../handler"

export const clearCommand: Command = {
  name: "clear",
  args: "<default>",
  description: "clear saved default package",
  requiresPkg: false,
  handler: async ({ tokens }, ctx) => {
    if (tokens[0] !== "default") {
      ctx.reporter.warn("unknown: clear — did you mean 'clear default'?")
      return
    }
    await clearDefaultPkg(ctx.root)
    ctx.reporter.success("default cleared")
  },
}