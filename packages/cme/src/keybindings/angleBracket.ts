// @paladin/codemirror-editor-experiment/keybindings/angleBracket.ts
import { keymap } from '@codemirror/view'
import { Extension } from '@codemirror/state'
import type { EditorView, KeyBinding } from '@codemirror/view'

const handleAngleBracket: KeyBinding = {
  key: '<',
  run(view: EditorView) {
    const { state } = view
    const { from, to } = state.selection.main
    view.dispatch({
      changes: { from, to, insert: '<>' },
      selection: { anchor: from + 1 },
    })
    return true
  },
}

export function angleBracket(): Extension {
  return keymap.of([handleAngleBracket])
}
