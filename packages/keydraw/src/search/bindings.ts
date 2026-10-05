import type { ScopeTable } from "../keys/extend"

export const SEARCH_BINDINGS: ScopeTable = {
  normal: {
    "/": "mode.search",
    n: "search.next",
    "#": "search.prev",
  },
  "normal:search": {
    "<Esc>": "search.clear",
  },
  search: {
    "<Enter>": "search.commit",
    "<Esc>": "search.cancel",
    "<BS>": "search.backspace",
    "<S-BS>": "search.deleteWord",
    "<Up>": "search.historyPrev",
    "<Down>": "search.historyNext",
  },
}
