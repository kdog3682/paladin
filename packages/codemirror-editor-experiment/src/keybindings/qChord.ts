// @paladin/codemirror-editor-experiment/keybindings/qChord.ts
import { EditorView } from '@codemirror/view'
import { Extension, EditorState } from '@codemirror/state'
import { inoremap } from './inoremap'

const INDENT = '  '

function getLineIndent(state: EditorState, pos: number): string {
  const line = state.doc.lineAt(pos)
  const match = line.text.match(/^(\s*)/)
  return match ? match[1] : ''
}

function dedent(indent: string): string {
  if (indent.endsWith(INDENT)) return indent.slice(0, -INDENT.length)
  if (indent.endsWith('\t')) return indent.slice(0, -1)
  return ''
}

function executeNewlineIndent(view: EditorView) {
  const { state } = view
  const line = state.doc.lineAt(state.selection.main.head)
  const currentIndent = getLineIndent(state, line.from)
  const newIndent = currentIndent + INDENT
  const insertPos = line.to

  view.dispatch({
    changes: { from: insertPos, insert: '\n' + newIndent },
    selection: { anchor: insertPos + 1 + newIndent.length },
  })
}

function executeNewlineDedent(view: EditorView) {
  const { state } = view
  const line = state.doc.lineAt(state.selection.main.head)
  const currentIndent = getLineIndent(state, line.from)
  const newIndent = dedent(currentIndent)
  const insertPos = line.to

  view.dispatch({
    changes: { from: insertPos, insert: '\n' + newIndent },
    selection: { anchor: insertPos + 1 + newIndent.length },
  })
}

export function qChord(): Extension {
  return inoremap('q', {
    w: executeNewlineIndent,
    e: executeNewlineDedent,
  })
}
