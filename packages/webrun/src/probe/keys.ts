import type { KeyInput } from "puppeteer"

const MODIFIERS: Record<string, KeyInput> = {
  cmd: "Meta",
  meta: "Meta",
  super: "Meta",
  ctrl: "Control",
  control: "Control",
  alt: "Alt",
  opt: "Alt",
  option: "Alt",
  shift: "Shift",
}

const NAMED: Record<string, KeyInput> = {
  esc: "Escape",
  escape: "Escape",
  enter: "Enter",
  return: "Enter",
  tab: "Tab",
  space: "Space",
  backspace: "Backspace",
  delete: "Delete",
  up: "ArrowUp",
  down: "ArrowDown",
  left: "ArrowLeft",
  right: "ArrowRight",
  arrowup: "ArrowUp",
  arrowdown: "ArrowDown",
  arrowleft: "ArrowLeft",
  arrowright: "ArrowRight",
  home: "Home",
  end: "End",
  pageup: "PageUp",
  pagedown: "PageDown",
}

// puppeteer resolves these characters to their numpad keys (code NumpadDivide),
// which no app listening for the main-row key (code Slash) will match
const MAIN_ROW: Record<string, KeyInput> = { "/": "Slash", "-": "Minus" }

export type KeyCombo = { modifiers: KeyInput[]; key: KeyInput }

/** "cmd+alt+shift+f" -> modifiers to hold, then the key to press. a trailing "+" is the plus key ("ctrl++") */
export function parseCombo(combo: string): KeyCombo {
  const plus = combo.endsWith("+")
  const parts = (plus ? combo.slice(0, -1) : combo).split("+").filter(Boolean)
  const last = plus ? "+" : parts.pop()
  if (!last) throw new Error(`empty key combo "${combo}"`)

  const modifiers = parts.map((p) => {
    const m = MODIFIERS[p.toLowerCase()]
    if (!m) throw new Error(`unknown modifier "${p}" in "${combo}" (cmd, ctrl, alt, shift)`)
    return m
  })
  const key = NAMED[last.toLowerCase()] ?? MAIN_ROW[last] ?? (last.length === 1 ? last.toLowerCase() : last)
  return { modifiers, key: key as KeyInput }
}
