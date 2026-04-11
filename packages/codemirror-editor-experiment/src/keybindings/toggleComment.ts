// @paladin/codemirror-editor-experiment/keybindings/toggleComment.ts
import { keymap } from '@codemirror/view'
import { Extension } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'

const COMMENT = '// '

export function toggleComment(): Extension {
  return keymap.of([{
    key: 'Mod-/',
    run(view: EditorView): boolean {
      const { state } = view

      // Collect all unique line numbers covered by selections
      const lineNumbers = new Set<number>()
      for (const range of state.selection.ranges) {
        const fromLine = state.doc.lineAt(range.from).number
        const toLine = state.doc.lineAt(range.to).number
        for (let n = fromLine; n <= toLine; n++) lineNumbers.add(n)
      }

      const lines = Array.from(lineNumbers).map(n => state.doc.line(n))
      if (lines.length === 0) return false

      const allCommented = lines.every(l => /^(\s*)\/\/ /.test(l.text))

      const changes = lines.map(line => {
        const indent = line.text.match(/^(\s*)/)?.[1] ?? ''
        const pos = line.from + indent.length
        if (allCommented) {
          return { from: pos, to: pos + COMMENT.length, insert: '' }
        } else {
          return { from: pos, to: pos, insert: COMMENT }
        }
      })

      const changeSet = state.changes(changes)
      view.dispatch({
        changes: changeSet,
        selection: state.selection.map(changeSet, 1),
      })
      return true
    },
  }])
}
