import type { ScopeTable } from "../keys/extend"

export const CMD_BINDINGS: ScopeTable = {
  normal: { ":": "mode.command" },
  command: {
    "<Enter>": "cmd.commit",
    "<Esc>": "cmd.cancel",
    "<BS>": "cmd.backspace",
    "<S-BS>": "cmd.deleteWord",
    "<Space>": "cmd.space",
    "<S-Space>": "cmd.spaceBack",
    "<Tab>": "cmd.accept",
    "<Up>": "cmd.historyPrev",
    "<Down>": "cmd.historyNext",
  },
}

export const CMD_COMMANDS = [
  { id: "mode.command", title: "Command line", group: "normal", description: "Doc-level commands and property tokens" },
  { id: "cmd.commit", title: "Run command", group: "command" },
  { id: "cmd.cancel", title: "Cancel command", group: "command", description: "reverts any live preview" },
  { id: "cmd.backspace", title: "Delete character", group: "command" },
  { id: "cmd.deleteWord", title: "Delete word", group: "command" },
  { id: "cmd.space", title: "Cycle value / space", group: "command" },
  { id: "cmd.spaceBack", title: "Cycle value backward", group: "command" },
  { id: "cmd.accept", title: "Accept completion", group: "command" },
  { id: "cmd.historyPrev", title: "Older command", group: "command" },
  { id: "cmd.historyNext", title: "Newer command", group: "command" },
]
