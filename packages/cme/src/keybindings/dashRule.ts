// @paladin/cme/keybindings/dashRule.ts
import { keymap, EditorView } from '@codemirror/view'
import { Extension } from '@codemirror/state'

const RULE = '-'.repeat(60)

export function dashRule(): Extension {
  return [
    EditorView.inputHandler.of((view, from, _to, text) => {
      if (text !== '-') return false
      const { state } = view
      const line = state.doc.lineAt(from)
      const offset = from - line.from

      // '- ' + '-' → '---' (first '-' expands to bullet '- ', jump straight to triple dash)
      if (offset === 2 && line.text.slice(0, 2) === '- ') {
        view.dispatch({
          changes: { from: line.from, to: from, insert: '---' },
          selection: { anchor: line.from + 3 },
        })
        return true
      }

      // '--' + '-' → '---' (intermediate step)
      if (offset === 2 && line.text.slice(0, 2) === '--') {
        view.dispatch({
          changes: { from: line.from, to: from, insert: '---' },
          selection: { anchor: line.from + 3 },
        })
        return true
      }

      // '---' + '-' → 60-dash rule
      if (offset === 3 && line.text.slice(0, 3) === '---') {
        view.dispatch({
          changes: { from: line.from, to: from, insert: RULE + '\n' },
          selection: { anchor: line.from + RULE.length + 1 },
        })
        return true
      }

      return false
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
