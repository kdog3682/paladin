// @paladin/codemirror-editor-experiment/keybindings/dashRule.ts
import { keymap, EditorView } from '@codemirror/view'
import { Extension } from '@codemirror/state'

const RULE = '-'.repeat(64)

export function dashRule(): Extension {
  return [
    EditorView.inputHandler.of((view, from, _to, text) => {
      if (text !== '-') return false
      const { state } = view
      const line = state.doc.lineAt(from)
      // Only fire when cursor is right after '--' at start of line (no other content)
      if (from - line.from !== 2) return false
      if (line.text.slice(0, 2) !== '--') return false

      view.dispatch({
        changes: { from: line.from, to: from, insert: RULE + '\n' },
        selection: { anchor: line.from + RULE.length + 1 },
      })
      return true
    }),
    keymap.of([{
      key: '-',
      run(view: EditorView) {
        const { state } = view
        const { head } = state.selection.main
        const line = state.doc.lineAt(head)
        if (line.text.trim() !== '') return false
        const indent = line.text.match(/^(\s*)/)?.[1] ?? ''
        const insert = indent + '- '
        view.dispatch({
          changes: { from: line.from, to: line.to, insert },
          selection: { anchor: line.from + insert.length },
        })
        return true
      },
    }]),
  ]
}
