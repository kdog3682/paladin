// runtime: the sequence engine, the controller + reactive store, and the react
// hook. the core knows nothing about textareas, popups, cmdlines or autocomplete
// — apps compose those on top by defining modes and a dispatch.

import { useMemo, useEffect, useSyncExternalStore } from "react"
import {
  normalize,
  MODE_ACTION,
  type Action,
  type Binding,
  type Keymap,
  type Dispatch,
  type CompiledConfig,
} from "./keymap"

export * from "./keymap"

// ------------------------------------------------------------------- engine
// matches multi-chord sequences ("g g", "d d") with a prefix timeout. used only
// for non-capture modes. capture modes bypass this and do single-chord lookups.

type FeedResult =
  | { kind: "action", binding: Binding }
  | { kind: "pending" }
  | { kind: "none" }

export class KeybindEngine {
  private buffer: string[] = []
  private timer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private keymap: Keymap,
    private seqTimeout = 600,
    private onChange?: () => void, // fires whenever the pending buffer changes
  ) {}

  get pending(): readonly string[] {
    return this.buffer
  }

  setKeymap(km: Keymap) {
    this.keymap = km
    this.reset()
  }

  reset() {
    const had = this.buffer.length > 0
    this.buffer = []
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    if (had) this.onChange?.()
  }

  feed(chord: string): FeedResult {
    this.buffer.push(chord)
    const seq = this.buffer.join(" ")
    const exact = this.keymap[seq]
    const isPrefix = Object.keys(this.keymap).some(k => k !== seq && k.startsWith(seq + " "))

    if (exact && !isPrefix) {
      this.reset()
      return { kind: "action", binding: exact }
    }
    if (isPrefix) {
      this.arm()
      this.onChange?.()
      return { kind: "pending" }
    }
    if (exact) {
      this.reset()
      return { kind: "action", binding: exact }
    }
    this.reset()
    return { kind: "none" }
  }

  private arm() {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => this.reset(), this.seqTimeout)
  }
}

// --------------------------------------------------------------- controller

export type Snapshot<M extends string> = {
  mode: M
  pending: readonly string[] // current chord buffer, for which-key style hints
}

export type KeybindOptions<M extends string> = CompiledConfig<M> & {
  dispatch: Dispatch<M>
  seqTimeout?: number
  capture?: boolean // default false (bubble phase, so widgets win by default)
}

export type KeybindController<M extends string> = {
  attach: () => void
  detach: () => void
  setMode: (m: M) => void
  getMode: () => M
  dispatch: (action: Action, target?: string) => void
  subscribe: (fn: () => void) => () => void
  getSnapshot: () => Snapshot<M>
  handleKeydown: (e: KeyboardEvent) => void
}

export function createKeybind<M extends string>(opts: KeybindOptions<M>): KeybindController<M> {
  let mode = opts.initialMode
  const listeners = new Set<() => void>()
  let snapshot: Snapshot<M> = { mode, pending: [] }

  // rebuild the snapshot (new ref) and notify. useSyncExternalStore relies on the
  // ref only changing when something actually changed, which is why pending is
  // copied here and nowhere else.
  function emit() {
    snapshot = { mode, pending: [...engine.pending] }
    for (const l of listeners) l()
  }

  const engine = new KeybindEngine(opts.keymaps[mode] ?? {}, opts.seqTimeout, emit)
  const capture = opts.capture ?? false

  function run(b: Binding) {
    if (b.action.type === MODE_ACTION) {
      setMode(b.action.payload as M)
      return
    }
    opts.dispatch(b.action, { target: b.target, mode })
  }

  function setMode(m: M) {
    if (m === mode) return
    opts.modes[mode]?.onExit?.()
    mode = m
    engine.setKeymap(opts.keymaps[m] ?? {})
    opts.modes[m]?.onEnter?.()
    emit()
  }

  function handleKeydown(e: KeyboardEvent) {
    const chord = normalize(e)

    // globals fire in every mode, before anything else — so ctrl+s saves even
    // mid-typing in a capture mode.
    const g = opts.globals[chord]
    if (g) {
      e.preventDefault()
      run(g)
      return
    }

    const mc = opts.modes[mode]
    const km = opts.keymaps[mode] ?? {}

    // capture mode: single-chord lookup only. a match (escape/enter/...) is
    // handled; everything else passes through to the focused widget untouched.
    if (mc?.captureText) {
      const b = km[chord]
      if (b) {
        e.preventDefault()
        run(b)
      }
      return
    }

    // non-capture mode: run the sequence engine.
    const r = engine.feed(chord)
    if (r.kind === "action") {
      e.preventDefault()
      run(r.binding)
    } else if (r.kind === "pending") {
      e.preventDefault()
    } else if (mc?.swallow ?? true) {
      e.preventDefault()
    }
  }

  const listener = (e: Event) => handleKeydown(e as KeyboardEvent)

  return {
    attach: () => window.addEventListener("keydown", listener, { capture }),
    detach: () => window.removeEventListener("keydown", listener, { capture }),
    setMode,
    getMode: () => mode,
    dispatch: (action, target = "main") => opts.dispatch(action, { target, mode }),
    subscribe: fn => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    getSnapshot: () => snapshot,
    handleKeydown,
  }
}

// -------------------------------------------------------------------- react
// thin hook: memoize the controller, attach for the lifetime of the component,
// and pull { mode, pending } reactively. no onModeChange, no mirrored state.

export function useKeybind<M extends string>(
  factory: () => KeybindController<M>,
  deps: unknown[] = [],
) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const kb = useMemo(factory, deps)
  useEffect(() => {
    kb.attach()
    return () => kb.detach()
  }, [kb])
  const snap = useSyncExternalStore(kb.subscribe, kb.getSnapshot)
  return { ...snap, kb }
}
