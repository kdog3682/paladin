import type { ScopeTable } from "../keys/extend"

export const ATTRS_BINDINGS: ScopeTable = {
  normal: { I: "attrs.focus" },
  attrs: {
    "<Up>": "attrs.up",
    "<Down>": "attrs.down",
    "<Space>": "attrs.cycle",
    "<S-Space>": "attrs.cycle.back",
    "<A-Up>": "attrs.nudge.up",
    "<A-Down>": "attrs.nudge.down",
    "<A-S-Up>": "attrs.nudge.up.big",
    "<A-S-Down>": "attrs.nudge.down.big",
    "<CR>": "attrs.edit",
    x: "attrs.reset",
    "<Esc>": "attrs.exit",
  },
}
