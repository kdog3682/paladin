import { StateField, StateEffect, type Extension } from '@codemirror/state'
import { Decoration, EditorView, type DecorationSet } from '@codemirror/view'
import { inoremap } from '../editor/keymap'
import type { Feature } from './types'

// --- state -----------------------------------------------------------------
const toggleFold = StateEffect.define<{ from: number; to: number }>()

// foldField is JSON-serializable, so it can ride state.toJSON/fromJSON.
const foldField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(set, tr) {
    set = set.map(tr.changes)
    for (const e of tr.effects) {
      if (e.is(toggleFold)) {
        const d = Decoration.replace({ block: true }).range(e.value.from, e.value.to)
        set = set.update({ add: [d] })
      }
    }
    return set
  },
  provide: (f) => EditorView.decorations.from(f),
  // these two make persistence work via state.toJSON(persistFields)
  toJSON: (set) => {
    const out: { from: number; to: number }[] = []
    set.between(0, Infinity, (from, to) => {
      out.push({ from, to })
    })
    return out
  },
  fromJSON: (json: { from: number; to: number }[]) =>
    Decoration.set(json.map((r) => Decoration.replace({ block: true }).range(r.from, r.to))),
})

// --- behavior --------------------------------------------------------------
function toggleSectionFold(view: EditorView): boolean {
  const line = view.state.doc.lineAt(view.state.selection.main.head)
  // (real impl: find the section bounds around the cursor)
  view.dispatch({ effects: toggleFold.of({ from: line.from, to: line.to }) })
  return true
}

const foldClickHandler = EditorView.domEventHandlers({
  /* expand on click of a folded region */
})

// --- the feature -----------------------------------------------------------
// note: foldField appears once in editor (so CM owns it) and once in persist
// (so the assembler knows to serialize it).
export const foldFeature: Feature = {
  name: 'fold',
  editor: [foldField, foldClickHandler, inoremap({ zf: toggleSectionFold })] as Extension,
  persist: [{ key: 'fold', field: foldField as StateField<unknown> }],
}
