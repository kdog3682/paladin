// data + helpers. no runtime, no DOM listeners, no framework.
// this file knows about chords, modes (opaque strings) and actions. nothing else.

export type Action = { type: string, payload?: unknown }
export type Binding = { action: Action, target: string }

// compiled keymap: space-joined chord sequence -> binding
export type Keymap = Record<string, Binding>

export type DispatchMeta<M extends string> = { target: string, mode: M }
export type Dispatch<M extends string> = (action: Action, meta: DispatchMeta<M>) => void

// reserved action type. the controller intercepts this and switches mode
// instead of forwarding it to dispatch. lets keymaps declare transitions as data.
export const MODE_ACTION = "@mode"
export const DEFAULT_TARGET = "main"

// per-mode behaviour. all app-specific side effects live in the hooks.
//   captureText: the focused widget (CodeMirror, an <input>) owns typing.
//                the engine stands down and only matches single-chord bindings
//                (escape/enter/etc). unmatched keys pass through untouched.
//   swallow:     preventDefault on unmatched keys. defaults to !captureText,
//                so normal-mode strays are eaten but capture-mode typing flows.
//   onEnter/onExit: imperative side effects on transition (e.g. focus/blur).
export type ModeConfig = {
  captureText?: boolean
  swallow?: boolean
  onEnter?: () => void
  onExit?: () => void
}

// ------------------------------------------------------------ author entries
// what you write on the right-hand side of a keymap:
//   "undo"                         -> action { type: "undo" }, default target
//   { do, arg, on }                -> full control over payload + target
//   toMode("normal")              -> a mode transition (sugar over { do, arg })

export type Entry =
  | string
  | { do: string, arg?: unknown, on?: string }

export function toMode(m: string): Entry {
  return { do: MODE_ACTION, arg: m }
}

function toBinding(e: Entry): Binding {
  if (typeof e === "string") return { action: { type: e }, target: DEFAULT_TARGET }
  return { action: { type: e.do, payload: e.arg }, target: e.on ?? DEFAULT_TARGET }
}

// ---------------------------------------------------------------- normalize
// KeyboardEvent -> canonical chord string, e.g. "ctrl+s", "A", "arrowleft".

const MODS = new Set(["ctrl", "alt", "shift", "meta"])
const NAMED = new Set([
  "arrowleft", "arrowright", "arrowup", "arrowdown",
  "escape", "enter", "tab", "backspace", "delete",
  "home", "end", "pageup", "pagedown", "space",
])

export function normalize(e: KeyboardEvent): string {
  const k = e.key
  const printable = k.length === 1
  const mods: string[] = []
  if (e.ctrlKey) mods.push("ctrl")
  if (e.metaKey) mods.push("meta")
  if (e.altKey) mods.push("alt")
  if (!printable && e.shiftKey) mods.push("shift") // shift is baked into printables (A, ?, :)
  const base = printable ? (k === " " ? "space" : k) : k.toLowerCase()
  return [...mods, base].join("+")
}

// --------------------------------------------------------------- tokenizer
// author spec ("gg", "ctrl+s", "arrowleft", "A") -> chord list.
// printables carry shift already: write "A"/"?"/":", not "shift+a".
// "shift+" is only meaningful for named keys.

function matchWord(s: string, i: number, set: Set<string>): string | null {
  let best: string | null = null
  for (const w of set) {
    if (s.slice(i, i + w.length).toLowerCase() === w && (!best || w.length > best.length)) best = w
  }
  return best
}

export function parseBinding(spec: string): string[] {
  const chords: string[] = []
  let i = 0
  while (i < spec.length) {
    const mods: string[] = []
    for (;;) {
      const m = matchWord(spec, i, MODS)
      if (m && spec[i + m.length] === "+") {
        mods.push(m)
        i += m.length + 1
      } else break
    }
    const named = matchWord(spec, i, NAMED)
    let base: string
    if (named) {
      base = named
      i += named.length
    } else {
      base = spec[i]
      i += 1
    }
    chords.push([...mods, base].join("+"))
  }
  return chords
}

// ------------------------------------------------------------------ compile

export function compile(raw: Record<string, Entry>): Keymap {
  const out: Keymap = {}
  for (const [spec, e] of Object.entries(raw)) out[parseBinding(spec).join(" ")] = toBinding(e)
  return out
}

// -------------------------------------------------------------- defineKeybinds
// the ergonomic config surface. write modes + globals + per-mode keymaps once;
// get back a compiled config ready to hand to createKeybind.
//   M is inferred from `modes`, so keymaps/initialMode autocomplete per app.

export type KeybindsConfig<M extends string> = {
  modes: Record<M, ModeConfig>
  globals?: Record<string, Entry>
  keymaps: Partial<Record<M, Record<string, Entry>>>
  initialMode: M
}

export type CompiledConfig<M extends string> = {
  modes: Record<M, ModeConfig>
  globals: Keymap
  keymaps: Record<M, Keymap>
  initialMode: M
}

export function defineKeybinds<M extends string>(cfg: KeybindsConfig<M>): CompiledConfig<M> {
  const globals = compile(cfg.globals ?? {})
  const keymaps = {} as Record<M, Keymap>
  for (const m of Object.keys(cfg.modes) as M[]) keymaps[m] = compile(cfg.keymaps[m] ?? {})
  return { modes: cfg.modes, globals, keymaps, initialMode: cfg.initialMode }
}

// -------------------------------------------------------------------- routed
// build a dispatch from a target -> handler map. keeps multi-surface routing
// (main / popup / canvas / ...) in app code instead of baked into the core.
//   routed({ main: a => app.run(a), popup: a => win()?.postMessage(a, "*") })

export function routed<M extends string = string>(
  targets: Record<string, (action: Action, meta: DispatchMeta<M>) => void>,
): Dispatch<M> {
  return (action, meta) => {
    const h = targets[meta.target] ?? targets[DEFAULT_TARGET]
    if (!h) throw new Error(`keybind: no handler for target "${meta.target}"`)
    h(action, meta)
  }
}
