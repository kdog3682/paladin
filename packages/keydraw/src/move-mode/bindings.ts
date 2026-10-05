import type { ScopeTable } from "../keys/extend"

export const MOVE_BINDINGS: ScopeTable = {
  normal: { m: "mode.move" },
  move: {
    "<Up>": "move.up",
    "<Down>": "move.down",
    "<Left>": "move.left",
    "<Right>": "move.right",
    "<S-Up>": "move.up.big",
    "<S-Down>": "move.down.big",
    "<S-Left>": "move.left.big",
    "<S-Right>": "move.right.big",
    "<CR>": "move.commit",
    "<Esc>": "move.cancel",
  },
}
