import type { EditorView } from '@codemirror/view'

export function insertCodeBlock(view: EditorView): boolean {
  const { state } = view
  const { head } = state.selection.main
  const line = state.doc.lineAt(head)

  if (head !== line.to) return false

  const indent = line.text.match(/^(\s*)/)?.[1] ?? ''
  const fence = indent + '```'

  let blankStartLine = line.number
  if (line.text.trim() === '') {
    while (blankStartLine > 1 && state.doc.line(blankStartLine - 1).text.trim() === '') {
      blankStartLine--
    }
  }

  let blankEndLine = line.number
  while (blankEndLine < state.doc.lines && state.doc.line(blankEndLine + 1).text.trim() === '') {
    blankEndLine++
  }

  const hasContentAbove = blankStartLine > 1
  const hasContentBelow = blankEndLine < state.doc.lines

  let insert = ''
  if (hasContentAbove) insert += '\n'
  insert += fence + '\n' + indent + '\n' + fence
  if (hasContentBelow) insert += '\n'

  const fromPos = line.text.trim() === ''
    ? state.doc.line(blankStartLine).from
    : head
  const toPos = blankEndLine > line.number
    ? state.doc.line(blankEndLine).to
    : head

  const cursorInInsert = (hasContentAbove ? 1 : 0) + fence.length + 1 + indent.length

  view.dispatch({
    changes: { from: fromPos, to: toPos, insert },
    selection: { anchor: fromPos + cursorInInsert },
  })
  return true
}
