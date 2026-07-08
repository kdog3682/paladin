import type { EditorView } from '@codemirror/view'

const COMMENT = '// '

export function toggleComment(view: EditorView): boolean {
  const { state } = view
  const lineNumbers = new Set<number>()
  for (const range of state.selection.ranges) {
    const fromLine = state.doc.lineAt(range.from).number
    const toLine = state.doc.lineAt(range.to).number
    for (let n = fromLine; n <= toLine; n++) lineNumbers.add(n)
  }
  const lines = Array.from(lineNumbers).map(n => state.doc.line(n))
  if (lines.length === 0) return false
  const nonBlank = lines.filter(l => l.text.trim().length > 0)
  const target = nonBlank.length > 0 ? nonBlank : lines
  const allCommented = target.every(l => /^(\s*)\/\/ /.test(l.text))
  const minIndent = Math.min(
    ...target.map(l => l.text.match(/^(\s*)/)?.[1].length ?? 0)
  )
  const changes = target.map(line => {
    if (allCommented) {
      const indent = line.text.match(/^(\s*)/)?.[1] ?? ''
      const pos = line.from + indent.length
      return { from: pos, to: pos + COMMENT.length, insert: '' }
    } else {
      const pos = line.from + minIndent
      return { from: pos, to: pos, insert: COMMENT }
    }
  })
  const changeSet = state.changes(changes)
  view.dispatch({
    changes: changeSet,
    selection: state.selection.map(changeSet, 1),
  })
  return true
}
