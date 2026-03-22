// @paladin/codemirror-editor-experiment/keybindings/semicolonToColon.ts
import { keymap } from '@codemirror/view'
import { EditorSelection, Extension } from '@codemirror/state'
import type { EditorView, KeyBinding } from '@codemirror/view'

const handleSemicolon: KeyBinding = {
  key: ';',
  run(view: EditorView) {
    const { state } = view
    const tr = state.changeByRange(range => ({
      changes: { from: range.from, to: range.to, insert: ':' },
      range: EditorSelection.cursor(range.from + 1),
    }))
    view.dispatch(tr)
    return true
  },
}

export function semicolonToColon(): Extension {
  return keymap.of([handleSemicolon])
}
