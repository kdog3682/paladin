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

function nextLineIsBlank(state: EditorState, lineNumber: number): boolean {
  if (lineNumber >= state.doc.lines) return false
  const nextLine = state.doc.line(lineNumber + 1)
  return nextLine.text.trim() === ''
}

function moveToBlankNextLine(view: EditorView, lineNumber: number) {
  const { state } = view
  const nextLine = state.doc.line(lineNumber + 1)
  view.dispatch({ selection: { anchor: nextLine.from + nextLine.text.length } })
}

function executeNewlineIndent(view: EditorView) {
  const { state } = view
  const line = state.doc.lineAt(state.selection.main.head)
  if (nextLineIsBlank(state, line.number)) {
    moveToBlankNextLine(view, line.number)
    return
  }
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
  if (nextLineIsBlank(state, line.number)) {
    moveToBlankNextLine(view, line.number)
    return
  }
  const currentIndent = getLineIndent(state, line.from)
  const newIndent = dedent(currentIndent)
  const insertPos = line.to
  view.dispatch({
    changes: { from: insertPos, insert: '\n' + newIndent },
    selection: { anchor: insertPos + 1 + newIndent.length },
  })
}

function executeNewline(view: EditorView) {
  const { state } = view
  const line = state.doc.lineAt(state.selection.main.head)
  if (nextLineIsBlank(state, line.number)) {
    moveToBlankNextLine(view, line.number)
    return
  }
  const currentIndent = getLineIndent(state, line.from)
  const insertPos = line.to
  view.dispatch({
    changes: { from: insertPos, insert: '\n' + currentIndent },
    selection: { anchor: insertPos + 1 + currentIndent.length },
  })
}

function executeCursorRight(view: EditorView) {
  const { state } = view
  const pos = state.selection.main.head
  if (pos < state.doc.length) {
    view.dispatch({ selection: { anchor: pos + 1 } })
  }
}
