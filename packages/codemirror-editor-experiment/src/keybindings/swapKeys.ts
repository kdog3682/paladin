// @paladin/codemirror-editor-experiment/keybindings/swapKeys.ts
import { EditorView } from '@codemirror/view'
import { Extension } from '@codemirror/state'

// Instant single-character remappings
const CHAR_MAP: Record<string, string> = {
  '4': '$',
  '$': '4',
  ';': ':',
  ':': ';',
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

export function swapKeys(): Extension {
  return EditorView.inputHandler.of((view, from, to, text) => {
    const mapped = CHAR_MAP[text]
    if (mapped) {
      view.dispatch({
        changes: { from, to, insert: mapped },
        selection: { anchor: from + mapped.length },
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

    return false
  })
}
