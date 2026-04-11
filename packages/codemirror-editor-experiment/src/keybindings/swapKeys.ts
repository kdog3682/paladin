// @paladin/codemirror-editor-experiment/keybindings/swapKeys.ts
import { EditorView, keymap } from '@codemirror/view'
import { EditorSelection, Extension, Prec } from '@codemirror/state'

// Instant single-character remappings
const CHAR_MAP: Record<string, string> = {
  '4': '$',
  '$': '4',
  ';': ':',
  ':': ';',
  '(': '9',
  ',': ', ',
}

// Two-character sequence remappings: typed char → { preceding char → replacement }
const SEQUENCE_MAP: Record<string, Record<string, string>> = {
  r: { '\\': '→' },
}

function padWithSpaces(insert: string, before: string, after: string): string {
  const needsBefore = before !== '' && before !== ' ' && before !== '\n'
  const needsAfter = after !== ' '
  return (needsBefore ? ' ' : '') + insert + (needsAfter ? ' ' : '')
}

const bracketOnNine = keymap.of([
  {
    key: '9',
    run(view) {
      const { state } = view
      const changes = state.changeByRange((range) => {
        if (range.empty) {
          return {
            changes: { from: range.from, insert: '()' },
            range: EditorSelection.cursor(range.from + 1),
          }
        }
        return {
          changes: [
            { from: range.from, insert: '(' },
            { from: range.to, insert: ')' },
          ],
          range: EditorSelection.range(range.from + 1, range.to + 1),
        }
      })
      view.dispatch({ ...changes, scrollIntoView: true, userEvent: 'input.type' })
      return true
    },
  },
])

export function swapKeys(): Extension {
  return [
    bracketOnNine,
    Prec.highest(EditorView.inputHandler.of((view, from, to, text) => {
      const mapped = CHAR_MAP[text]
      if (mapped) {
        const charAfter = view.state.doc.sliceString(to, to + 1)
        const insert = text === ',' && charAfter === ' ' ? ',' : mapped
        view.dispatch({
          changes: { from, to, insert },
          selection: { anchor: from + insert.length },
        })
        return true
      }

      const seqEntry = SEQUENCE_MAP[text]
      if (seqEntry && from > 0) {
        const prevChar = view.state.doc.sliceString(from - 1, from)
        const replacement = seqEntry[prevChar]
        if (replacement) {
          const before = from > 1 ? view.state.doc.sliceString(from - 2, from - 1) : ''
          const after = view.state.doc.sliceString(to, to + 1)
          const insert = padWithSpaces(replacement, before, after)
          view.dispatch({
            changes: { from: from - 1, to, insert },
            selection: { anchor: from - 1 + insert.length },
          })
          return true
        }
      }

      if (text === ' ' && from >= 2) {
        const preceding = view.state.doc.sliceString(from - 2, from)
        if ([', ', '. ', '! ', ': '].includes(preceding)) {
          return true
        }
      }

      return false
    })),
  ]
}
