import { applyPatches, enablePatches, produce, produceWithPatches, type Patch } from "immer"
import { applyChange, forRepeat, type Change, type ChangeCtx, type ChangeResult, type Clip } from "../../commands/changes"
import { newDoc } from "../../model/tree"
import type { Doc, Props } from "../../model/types"
import type { EditorState, Slice } from "../useEditor"
import { builtinDefaults, effectiveDefaults } from "./defaults"
import { selectionOf } from "./selection"

enablePatches()

export type HistoryEntry = {
  patches: Patch[]
  inverse: Patch[]
  label: string
  at: number
  /* consecutive entries with the same key inside a second merge (nudge bursts) */
  merge?: string
}

export type CommitOpts = {
  merge?: string
  /* false keeps the previous change as the "." target */
  repeatable?: boolean
}

export type DocSlice = {
  doc: Doc
  /* live preview of an uncommitted change; rendered instead of doc */
  draft: Doc | null
  past: HistoryEntry[]
  future: HistoryEntry[]
  /* last committed repeatable change, replayed by "." */
  lastChange: Change | null
  clipboard: Clip | null
  styleClip: Props | null
  commit: (change: Change, opts?: CommitOpts) => boolean
  preview: (change: Change | null) => void
  undo: () => boolean
  redo: () => boolean
  /* non-undoable doc edits (current artboard, title) */
  setDoc: (fn: (d: Doc) => void) => void
}

const MERGE_WINDOW = 1000

export function changeCtx(s: EditorState): ChangeCtx {
  return { focus: s.focus, selection: selectionOf(s), defaults: effectiveDefaults(s) }
}

export const createDocSlice: Slice<DocSlice> = (set, get) => ({
  doc: newDoc(builtinDefaults.nodes.artboard),
  draft: null,
  past: [],
  future: [],
  lastChange: null,
  clipboard: null,
  styleClip: null,

  commit: (change, opts = {}) => {
    const s = get()
    const ctx = changeCtx(s)
    let result: ChangeResult = {}
    const [next, patches, inverse] = produceWithPatches(s.doc, d => {
      result = applyChange(d, change, ctx)
    })
    if (!patches.length) {
      set({ draft: null })
      return false
    }
    const now = Date.now()
    const last = s.past[s.past.length - 1]
    const merging = !!opts.merge && last?.merge === opts.merge && now - last.at < MERGE_WINDOW && !s.future.length
    const past = merging
      ? [...s.past.slice(0, -1), { ...last, patches: [...last.patches, ...patches], inverse: [...inverse, ...last.inverse], at: now }]
      : [...s.past, { patches, inverse, label: change.type, at: now, merge: opts.merge }].slice(-s.defaults.editor.historyDepth)
    set({
      doc: next,
      draft: null,
      past,
      future: [],
      lastChange: opts.repeatable === false ? s.lastChange : forRepeat(change),
    })
    if (result.clearSelection) get().clearSelection()
    if (result.focus) get().setFocus(result.focus)
    return true
  },

  preview: change => {
    if (!change) {
      if (get().draft) set({ draft: null })
      return
    }
    const s = get()
    const ctx = changeCtx(s)
    set({ draft: produce(s.doc, d => void applyChange(d, change, ctx)) })
  },

  undo: () => {
    const s = get()
    const e = s.past[s.past.length - 1]
    if (!e) return false
    set({ doc: applyPatches(s.doc, e.inverse), past: s.past.slice(0, -1), future: [e, ...s.future], draft: null })
    get().repairFocus()
    return true
  },

  redo: () => {
    const s = get()
    const e = s.future[0]
    if (!e) return false
    set({ doc: applyPatches(s.doc, e.patches), past: [...s.past, e], future: s.future.slice(1), draft: null })
    get().repairFocus()
    return true
  },

  setDoc: fn => set({ doc: produce(get().doc, fn) }),
})
