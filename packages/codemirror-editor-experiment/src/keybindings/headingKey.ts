// @paladin/codemirror-editor-experiment/keybindings/headingKey.ts
import { keymap } from '@codemirror/view'
import { Extension } from '@codemirror/state'
import type { EditorView, KeyBinding } from '@codemirror/view'

const handleThree: KeyBinding = {
  key: '3',
  run(view: EditorView) {
    const { state } = view
    const { head } = state.selection.main
    const line = state.doc.lineAt(head)

    const match = line.text.match(/^(#{1,5}) /)



    if (match) {
      // Already a heading — add one more #
      const hashes = match[1] + '#'
      const insert = hashes + ' '
      view.dispatch({
        changes: { from: line.from, to: line.from + match[0].length, insert },
        selection: { anchor: line.from + insert.length },
      })
    } else if (line.text === '') {

      })
    } else {
      return false
    }

    return true
  },
}

export function headingKey(): Extension {
  return keymap.of([handleThree])
}
