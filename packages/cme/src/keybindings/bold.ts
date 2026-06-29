// @paladin/cme/keybindings/bold.ts
import { keymap, EditorView, Decoration, DecorationSet } from '@codemirror/view'
import { StateEffect, StateField } from '@codemirror/state'
import type { Extension, Range } from '@codemirror/state'

const boldMark = Decoration.mark({ class: 'cm-bold' })

const addBold = StateEffect.define<{ from: number; to: number }>()
const removeBold = StateEffect.define<{ from: number; to: number }>()

const boldField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none
  },
  update(decorations, tr) {
    decorations = decorations.map(tr.changes)
    for (const effect of tr.effects) {
      if (effect.is(addBold)) {
        const marks: Range<Decoration>[] = [boldMark.range(effect.value.from, effect.value.to)]
        decorations = decorations.update({ add: marks, sort: true })
      } else if (effect.is(removeBold)) {
        decorations = decorations.update({
          filter: (from, to) => to <= effect.value.from || from >= effect.value.to,
        })
      }
    }
    return decorations
  },
  provide: (f) => EditorView.decorations.from(f),
})

export function bold(): Extension {
  return [
    boldField,
    keymap.of([{
      key: 'Mod-b',
      run(view: EditorView): boolean {
        const { state } = view
        const sel = state.selection.main
        if (sel.empty) return false

        // check if the selection is fully covered by a bold decoration
        let covered = false
        state.field(boldField).between(sel.from, sel.to, (from, to) => {
          if (from <= sel.from && to >= sel.to) covered = true
        })

        view.dispatch({
          effects: covered
            ? removeBold.of({ from: sel.from, to: sel.to })
            : addBold.of({ from: sel.from, to: sel.to }),
        })
        return true
      },
    }]),
  ]
}
