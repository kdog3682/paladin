import type { EditorView } from '@codemirror/view'

export function heading(view: EditorView): boolean {
  const { state } = view
  const { head } = state.selection.main
  const line = state.doc.lineAt(head)
  const match = line.text.match(/^(#{1,5}) /)
  const afterPrefix = match ? line.from + match[0].length : line.from
  const insidePrefix = match ? head >= line.from && head <= afterPrefix : false
  if (head !== line.from && !insidePrefix) return false
  if (match) {
    // Already a heading — add one more #
    const hashes = match[1] + '#'
    const insert = hashes + ' '
    view.dispatch({
      changes: { from: line.from, to: line.from + match[0].length, insert },
      selection: { anchor: line.from + insert.length },
    })
  } else {
    // At line start — always expand to ##
    view.dispatch({
      changes: { from: line.from, insert: '## ' },
      selection: { anchor: line.from + 3 },
    })
  }
  return true
}