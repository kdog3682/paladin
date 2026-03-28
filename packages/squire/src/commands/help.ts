// @paladin/squire/src/commands/help.ts

import { generateHelp, type Command } from "../handler"

export function helpCommand(commands: Command[]): Command {
  return {
    name: "help",
    description: "show this help",
    requiresPkg: false,
    handler: async (_args, ctx) => {
      generateHelp(commands, ctx.reporter)
    },
  }
}
