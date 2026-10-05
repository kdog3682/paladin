/*
 * Scopes are a mode ("normal") or a mode plus a state ("normal:search").
 * Key sequences use vim notation (see notation.ts).
 * Bindings for later milestones (move, command line, search, …)
 * are added as those land.
 */

import { ARRANGE_BINDINGS } from "../arrange/bindings"
import { CMD_BINDINGS } from "../cmdline/bindings"
import { MODAL_BINDINGS } from "../ui/modalBindings"
import { MOVE_BINDINGS } from "../move-mode/bindings"
import { ATTRS_BINDINGS } from "../ui/attrsBindings"
import { SEARCH_BINDINGS } from "../search/bindings"
import { mergeScopes } from "./extend"

export type Keymap = {
  /* scope → key sequence → command id */
  bindings: Record<string, Record<string, string>>
  /* scope → lhs keys → rhs keys, expanded once (noremap) */
  aliases: Record<string, Record<string, string>>
}

/* user layer; null removes a default (:unmap / :unalias) */
export type KeymapOverride = {
  bindings: Record<string, Record<string, string | null>>
  aliases: Record<string, Record<string, string | null>>
}

const nudge = {
  "<A-Up>": "nudge.up",
  "<A-Down>": "nudge.down",
  "<A-S-Up>": "nudge.up10",
  "<A-S-Down>": "nudge.down10",
}

const nav = {
  "<Up>": "focus.prev",
  "<Down>": "focus.next",
  "<Left>": "focus.parent",
  "<Right>": "focus.child",
  "<S-Up>": "select.extendPrev",
  "<S-Down>": "select.extendNext",
}

const baseBindings: Record<string, Record<string, string>> = {
    normal: {
      ...nav,
      ...nudge,
      w: "focus.readNext",
      b: "focus.readPrev",
      gg: "focus.first",
      G: "focus.last",
      f: "hint.start",
      a: "arrow.start",

      "<Space>": "select.toggle",
      vv: "select.expand",
      "v-": "select.shrink",
      "<Esc>": "select.clear",

      x: "edit.delete",
      dd: "edit.delete",
      y: "edit.yank",
      p: "edit.pasteChild",
      P: "edit.pasteSibling",
      ys: "style.yank",
      ps: "style.paste",
      u: "history.undo",
      "<mod-z>": "history.undo",
      "<mod-S-z>": "history.redo",
      ".": "edit.repeat",

      o: "insert.spanChild",
      O: "insert.spanSibling",
      R: "insert.rect",
      E: "insert.ellipse",
      T: "insert.text",
      c: "text.edit",
      "<Enter>": "text.edit",

      i: "mode.input",

      "+": "view.zoomIn",
      "-": "view.zoomOut",
      "=": "view.zoomReset",
      zz: "view.center",
      zf: "view.fit",
      "<A-d>": "view.panDown",
      "<A-u>": "view.panUp",
      "<A-e>": "view.scrollDown",
      "<A-y>": "view.scrollUp",
      "<A-t>": "view.layerTree",
      gt: "board.next",
      gT: "board.prev",
    },
    input: {
      ...nav,
      ...nudge,
      "<Space>": "input.space",
      "<S-Space>": "input.spaceBack",
      "<BS>": "input.backspace",
      "<S-BS>": "input.deleteToken",
      "<Tab>": "input.accept",
      "<Enter>": "input.commit",
      "<Esc>": "input.escape",
    },
    text: {
      "<Enter>": "text.commit",
      "<S-Enter>": "text.newline",
      "<Esc>": "text.cancel",
      "<BS>": "text.backspace",
      "<S-BS>": "text.deleteWord",
    },
}

export const defaultKeymap: Keymap = {
  bindings: mergeScopes(baseBindings, MOVE_BINDINGS, ARRANGE_BINDINGS, CMD_BINDINGS, MODAL_BINDINGS, ATTRS_BINDINGS, SEARCH_BINDINGS),
  aliases: {
    normal: {
      ";": ":",
    },
    "normal:search": {
      "3": "#",
    },
  },
}

export const emptyOverride: KeymapOverride = { bindings: {}, aliases: {} }

function mergeTable(
  base: Record<string, Record<string, string>>,
  over: Record<string, Record<string, string | null>>,
): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {}
  for (const scope of new Set([...Object.keys(base), ...Object.keys(over)])) {
    const merged: Record<string, string | null> = { ...base[scope], ...over[scope] }
    out[scope] = Object.fromEntries(Object.entries(merged).filter((e): e is [string, string] => e[1] !== null))
  }
  return out
}

export function effectiveKeymap(override: KeymapOverride, base: Keymap = defaultKeymap): Keymap {
  return {
    bindings: mergeTable(base.bindings, override.bindings),
    aliases: mergeTable(base.aliases, override.aliases),
  }
}
