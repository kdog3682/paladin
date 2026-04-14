// @paladin/codemirror-editor-experiment/keybindings/bracketOnNine.ts
import { EditorView, keymap } from '@codemirror/view'
import { EditorSelection, Extension } from '@codemirror/state'

const CLOSING_DELIMITERS = new Set(['>', ')', ']', '}'])

export function bracketOnNine(): Extension {
  return keymap.of([
    {
      key: '9',
      run(view: EditorView) {
        const { state } = view
        const changes = state.changeByRange((range) => {
          if (!range.empty) {
            return {
              changes: [
                { from: range.from, insert: '(' },
                { from: range.to, insert: ')' },
              ],
              range: EditorSelection.range(range.from + 1, range.to + 1),
            }
          }

          const charAfter = state.doc.sliceString(range.from, range.from + 1)

          if (CLOSING_DELIMITERS.has(charAfter)) {
            return {
              changes: { from: range.from, insert: '()' },
              range: EditorSelection.cursor(range.from + 1),
            }
          }

          // Wrap from cursor to end of line with ()
          const line = state.doc.lineAt(range.from)
          const lineEnd = line.to
          return {
            changes: [
              { from: range.from, insert: '(' },
              { from: lineEnd, insert: ')' },
            ],
            range: EditorSelection.cursor(lineEnd + 2),
          }
        })
        view.dispatch({ ...changes, scrollIntoView: true, userEvent: 'input.type' })
        return true
      },
    },
  ])
}
