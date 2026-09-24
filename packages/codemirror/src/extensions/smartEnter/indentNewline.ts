import { EditorSelection } from '@codemirror/state'
import { type Command } from '@codemirror/view'
import { parseLinePrefix, repeatMarker } from '../lineUtils'

const isSpace = (ch: string | undefined) => ch === ' ' || ch === '\t'

/** newline that keeps the current line's indent (no language auto-indent) and
 * repeats a leading `//`, `*` or `-` marker. on an empty marker line the
 * marker is removed instead */
export const insertIndentedNewline: Command = (view) => {
  const { state } = view
  if (state.readOnly) return false
  const tr = state.changeByRange((range) => {
    const line = state.doc.lineAt(range.from)
    const { indent, marker, rest } = parseLinePrefix(line.text)
    const col = range.from - line.from
    const markerEnd = indent.length + marker.length

    // whitespace-only line: leave it empty, carry the indent down
    if (!line.text.trim()) {
      const insert = '\n' + indent
      return {
        changes: { from: line.from, to: Math.max(range.to, line.to), insert },
        range: EditorSelection.cursor(line.from + insert.length),
      }
    }

    // cursor inside the indentation: push the line down untouched
    if (range.empty && col <= indent.length) {
      return { changes: { from: line.from, insert: '\n' }, range: EditorSelection.cursor(range.from + 1) }
    }

    // `- ` / `// ` with nothing after it: drop the marker
    if (marker && range.empty && !rest.trim() && range.from === line.to) {
      const from = line.from + indent.length
      return { changes: { from, to: line.to }, range: EditorSelection.cursor(from) }
    }

    // trim whitespace left behind the cursor and in front of the carried text
    let from = range.from
    while (from > line.from + markerEnd && isSpace(line.text[from - line.from - 1])) from--
    const toLine = state.doc.lineAt(range.to)
    let to = range.to
    while (to < toLine.to && isSpace(toLine.text[to - toLine.from])) to++

    const insert = '\n' + indent + (col >= markerEnd ? repeatMarker(marker) : '')
    return { changes: { from, to, insert }, range: EditorSelection.cursor(from + insert.length) }
  })
  view.dispatch({ ...tr, scrollIntoView: true, userEvent: 'input' })
  return true
}
