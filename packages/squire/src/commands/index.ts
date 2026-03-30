// @paladin/squire/src/commands/index.ts

import { commitCommand } from "./commit"
import { revertCommand } from "./revert"
import { statusCommand } from "./status"
import { demoCommand, testCommand, mochiCommand } from "./watch-commands"
import { tempwriteCommand } from "./tempwrite"
import { setCommand } from "./set"
import { clearCommand } from "./clear"
import { viewCommand } from "./view"
import { helpCommand } from "./help"
import { exitCommand } from "./exit"
import { restartCommand } from "./restart"
import { lsCommand } from "./ls"
import { bashCommand } from "./bash"
import { claudeCommand } from "./claude"
import { docCommand } from "./doc"
import { pickCommand } from "./pick"
import type { Command } from "../handler"

const base: Command[] = [
  commitCommand,
  revertCommand,
  statusCommand,
  demoCommand,
  testCommand,
  mochiCommand,
  tempwriteCommand,
  setCommand,
  clearCommand,
  viewCommand,
  restartCommand,
  lsCommand,
  bashCommand,
  claudeCommand,
  docCommand,
  pickCommand,
  exitCommand,
]

export const commands: Command[] = [...base, helpCommand(base)]
