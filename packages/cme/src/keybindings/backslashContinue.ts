// @paladin/cme/keybindings/backslashContinue.ts
import { keymap } from '@codemirror/view'
import { Extension } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'

const INDENT = '  '

// matches any common list/bullet/comment marker at the start of a line
const LIST_PATTERN = /^(\s*)(?:[-*] |\d+[.)] |[a-zA-Z][)] |\[[\da-zA-Z]+\] |(?:i{1,3}|iv|vi?)\) |\/\/ |# )/

export function backslashContinue(): Extension {
  return keymap.of([{
    key: '\\',
    run(view: EditorView) {
      const { state } = view
      const { head } = state.selection.main
      const line = state.doc.lineAt(head)

      if (head !== line.to) return false

      const match = line.text.match(LIST_PATTERN)
      if (!match) return false

      const currentIndent = match[1]
      const newIndent = currentIndent + INDENT
      const insert = '\n' + newIndent

      view.dispatch({
        changes: { from: head, insert },
        selection: { anchor: head + insert.length },
      })
      return true
    },
  }])
}
