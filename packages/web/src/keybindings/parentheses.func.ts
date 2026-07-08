// @mathpen/editor/bracketOnNine.ts
import type { EditorView } from '@codemirror/view'
import { EditorSelection } from '@codemirror/state'

const CLOSING_DELIMITERS = new Set(['>', ')', ']', '}'])

export function bracketOnNine(view: EditorView): boolean {
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
    return {
      changes: { from: range.from, insert: '()' },
      range: EditorSelection.cursor(range.from + 1),
    }
  })
  view.dispatch({ ...changes, scrollIntoView: true, userEvent: 'input.type' })
  return true
}