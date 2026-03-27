// @paladin/codemirror-editor-experiment/keybindings/insertCodeBlock.ts
import { keymap } from '@codemirror/view'
import { Extension } from '@codemirror/state'
import type { EditorView, KeyBinding } from '@codemirror/view'

const handleBacktick: KeyBinding = {
  key: '`',
  run(view: EditorView) {
    const { state } = view
    const { head } = state.selection.main
    const line = state.doc.lineAt(head)

    // only trigger at end of line
    if (head !== line.to) return false

    const indent = line.text.match(/^(\s*)/)?.[1] ?? ''
    const fence = indent + '```'

    // scan backward: find the range of empty lines above (including current if empty)
    let blankStartLine = line.number
    if (line.text.trim() === '') {
      while (blankStartLine > 1 && state.doc.line(blankStartLine - 1).text.trim() === '') {
        blankStartLine--
      }
    }

    // scan forward: find the range of empty lines below
    let blankEndLine = line.number
    while (blankEndLine < state.doc.lines && state.doc.line(blankEndLine + 1).text.trim() === '') {
      blankEndLine++
    }

    const hasContentAbove = blankStartLine > 1
    const hasContentBelow = blankEndLine < state.doc.lines

    // build the replacement: [gap above] fence \n indent \n fence [gap below]
    let insert = ''
    if (hasContentAbove) insert += '\n'
    insert += fence + '\n' + indent + '\n' + fence
    if (hasContentBelow) insert += '\n'

    // replace from start of blank region to end of blank region
    const fromPos = line.text.trim() === ''
      ? state.doc.line(blankStartLine).from
      : head
    const toPos = blankEndLine > line.number
      ? state.doc.line(blankEndLine).to
      : head

    // cursor goes on the middle line (between the fences)
    const cursorInInsert = (hasContentAbove ? 1 : 0) + fence.length + 1 + indent.length

    view.dispatch({
      changes: { from: fromPos, to: toPos, insert },
      selection: { anchor: fromPos + cursorInInsert },
    })
    return true
  },
}

export function insertCodeBlock(): Extension {
  return keymap.of([handleBacktick])
}
