/*
 * Key notation, vim style.
 * Printable keys without modifiers are themselves: "a", "A", "?", "#".
 * Everything else is bracketed with modifiers in the order C A M S:
 * "<Up>", "<S-Up>", "<A-r>", "<A-S-l>", "<C-/>", "<Space>", "<S-BS>".
 * "<mod-x>" means Cmd on macOS and Ctrl elsewhere.
 */

const NAMED: Record<string, string> = {
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
  Enter: "Enter",
  Escape: "Esc",
  Tab: "Tab",
  Backspace: "BS",
  Delete: "Del",
  Home: "Home",
  End: "End",
  PageUp: "PageUp",
  PageDown: "PageDown",
  " ": "Space",
}

const CODE: Record<string, string> = {
  Slash: "/",
  Period: ".",
  Comma: ",",
  Minus: "-",
  Equal: "=",
  Semicolon: ";",
  Quote: "'",
  BracketLeft: "[",
  BracketRight: "]",
  Backslash: "\\",
  Backquote: "`",
}

const NAME_ALIASES: Record<string, string> = {
  up: "Up",
  down: "Down",
  left: "Left",
  right: "Right",
  enter: "Enter",
  cr: "Enter",
  return: "Enter",
  esc: "Esc",
  escape: "Esc",
  tab: "Tab",
  bs: "BS",
  backspace: "BS",
  del: "Del",
  delete: "Del",
  space: "Space",
  home: "Home",
  end: "End",
  pageup: "PageUp",
  pagedown: "PageDown",
  lt: "<",
}

const ORDER = ["C", "A", "M", "S"]

export const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform)

function bracket(name: string, mods: string[]): string {
  if (!mods.length && name.length === 1) return name
  const sorted = [...new Set(mods)].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b))
  return `<${sorted.map(m => `${m}-`).join("")}${name}>`
}

function codeBase(code: string): string | undefined {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase()
  if (/^Digit\d$/.test(code)) return code.slice(5)
  return CODE[code]
}

export type KeyEventLike = Pick<KeyboardEvent, "key" | "code" | "ctrlKey" | "altKey" | "metaKey" | "shiftKey">

/* Alt/Ctrl/Meta combos match on event.code, since macOS turns Alt+letter into special characters */
export function eventToKey(e: KeyEventLike): string | null {
  if (["Shift", "Control", "Alt", "Meta", "CapsLock", "Dead"].includes(e.key)) return null
  const mods: string[] = []
  if (e.ctrlKey) mods.push("C")
  if (e.altKey) mods.push("A")
  if (e.metaKey) mods.push("M")
  const named = NAMED[e.key]
  if (named) return bracket(named, e.shiftKey ? [...mods, "S"] : mods)
  if (mods.length) {
    const base = codeBase(e.code) ?? e.key.toLowerCase()
    return bracket(base, e.shiftKey ? [...mods, "S"] : mods)
  }
  if (e.key.length === 1) return e.key
  return null
}

function modCode(m: string): string {
  const l = m.toLowerCase()
  if (l === "mod") return isMac ? "M" : "C"
  if (l === "c" || l === "ctrl") return "C"
  if (l === "a" || l === "alt") return "A"
  if (l === "m" || l === "meta" || l === "cmd") return "M"
  return "S"
}

/* normalizes the inside of a bracket, e.g. "S-A-up" → "<A-S-Up>", "S-a" → "A" */
export function normalizeKey(inner: string): string {
  const mods = new Set<string>()
  let rest = inner
  for (;;) {
    const m = /^(mod|ctrl|alt|meta|cmd|shift|C|A|M|S)-(.+)$/i.exec(rest)
    if (!m) break
    mods.add(modCode(m[1]))
    rest = m[2]
  }
  let name = NAME_ALIASES[rest.toLowerCase()] ?? rest
  const hard = [...mods].some(m => m !== "S")
  if (name.length === 1 && hard) name = name.toLowerCase()
  if (name.length === 1 && !hard && mods.has("S")) return name.toUpperCase()
  return bracket(name, [...mods])
}

/* "gg" → ["g","g"], "3<S-Down>" → ["3","<S-Down>"], "<lt>" → ["<"] */
export function parseSeq(seq: string): string[] {
  const keys: string[] = []
  for (let i = 0; i < seq.length; i++) {
    if (seq[i] === "<") {
      const j = seq.indexOf(">", i + 2)
      if (j > 0) {
        keys.push(normalizeKey(seq.slice(i + 1, j)))
        i = j
        continue
      }
    }
    keys.push(seq[i])
  }
  return keys
}

const PRETTY: Record<string, string> = {
  Up: "↑",
  Down: "↓",
  Left: "←",
  Right: "→",
  Space: "Space",
  BS: "Backspace",
}

const PRETTY_MOD: Record<string, string> = { C: "Ctrl", A: "Alt", M: isMac ? "Cmd" : "Meta", S: "Shift" }

/* "<A-S-Up>" → "Alt-Shift-↑" */
export function prettyKey(key: string): string {
  if (!key.startsWith("<") || key.length < 3) return key
  const parts = key.slice(1, -1).split("-")
  const name = parts.pop() || "-"
  return [...parts.map(m => PRETTY_MOD[m] ?? m), PRETTY[name] ?? name].join("-")
}

export function prettySeq(keys: string[]): string {
  return keys.map(prettyKey).join(" ")
}
