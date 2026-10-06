import { flattenEntries } from "./search"
import type { Page, PaletteState } from "./types"

export type KeyEventLike = {
  key: string
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
  altKey?: boolean
  isComposing?: boolean
}

export type Intent =
  /* let the focused element handle the key */
  | { type: "pass" }
  /* swallow the key and do nothing */
  | { type: "noop" }
  | { type: "move"; delta: 1 | -1 }
  /* run the highlighted entry or push its page */
  | { type: "choose" }
  /* push the highlighted command's page, empty */
  | { type: "enter" }
  /* accept the highlighted completion into the active argument */
  | { type: "accept" }
  | { type: "nextArg" }
  | { type: "prevArg" }
  | { type: "deleteChip" }
  | { type: "submit" }
  | { type: "pop" }
  | { type: "close" }

const PASS: Intent = { type: "pass" }

function pageInput<Ctx, R>(page: Page<Ctx, R>) {
  switch (page.type) {
    case "root":
    case "list":
      return page.query
    case "text":
      return page.text
    case "args": {
      const arg = page.command.args[page.activeArg]
      return arg ? (page.values[arg.name] ?? "") : ""
    }
  }
}

/* encodes the key table from the spec; components dispatch the result */
export function resolveKey<Ctx, R>(
  page: Page<Ctx, R>,
  event: KeyEventLike,
  state: PaletteState<Ctx, R>,
): Intent {
  if (event.isComposing) return PASS

  const mod = event.metaKey || event.ctrlKey
  const empty = pageInput(page) === ""

  if (event.key === "Escape") return page.type === "root" ? { type: "close" } : { type: "pop" }

  if (event.key === "Backspace" && empty && !mod) {
    if (page.type === "root") return PASS
    if (page.type === "args") {
      const arg = page.command.args[page.activeArg]
      /* backspace eats a whole chip: the last one of this arg, else the previous arg's */
      if (arg?.multiple && page.lists[arg.name]?.length) return { type: "deleteChip" }
      if (page.activeArg > 0) return { type: "deleteChip" }
    }
    return { type: "pop" }
  }

  switch (page.type) {
    case "root":
    case "list": {
      if (event.key === "Enter") return { type: "choose" }
      if (event.key === "Tab") {
        const entry = flattenEntries(state.entries)[state.selectedIndex]
        const enterable = entry?.kind === "command" && entry.command.type !== "action"
        return enterable ? { type: "enter" } : { type: "noop" }
      }
      if (event.key === "ArrowDown") return { type: "move", delta: 1 }
      if (event.key === "ArrowUp") return { type: "move", delta: -1 }
      return PASS
    }

    case "args": {
      const isLast = page.activeArg >= page.command.args.length - 1
      if (event.key === "Enter") {
        if (mod) return { type: "submit" }
        const arg = page.command.args[page.activeArg]
        const highlighted = state.completions[state.selectedIndex]
        /* a multiple arg with chips and nothing typed is finished, not asking for another */
        const done = arg?.multiple && empty && page.lists[arg.name]?.length
        /* a completion equal to the current value counts as already accepted */
        if (!done && highlighted && (arg?.multiple || highlighted.value !== pageInput(page))) {
          return { type: "accept" }
        }
        return isLast ? { type: "submit" } : { type: "nextArg" }
      }
      if (event.key === "Tab") return event.shiftKey ? { type: "prevArg" } : { type: "nextArg" }
      if (event.key === "ArrowDown") return { type: "move", delta: 1 }
      if (event.key === "ArrowUp") return { type: "move", delta: -1 }
      return PASS
    }

    case "text": {
      if (event.key === "Enter" && mod) return { type: "submit" }
      /* keep focus inside the palette */
      if (event.key === "Tab") return { type: "noop" }
      return PASS
    }
  }
}

export function isMac() {
  if (typeof navigator === "undefined") return true
  return /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent)
}

/* "⌘" on mac, "Ctrl" elsewhere */
export function modKeyLabel() {
  return isMac() ? "⌘" : "Ctrl+"
}
