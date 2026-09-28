import type { EditorView } from '@codemirror/view'
import { EditorState } from '@codemirror/state'

const INDENT = '  '

/** `- `, `* `, `+ `, `1. ` — a marker counts as indentation, so a child line
 * lands past it rather than aligned with its text. */
const LIST_MARKER = /^\s*(?:[-*+]|\d+[.)])\s+/

/** The whitespace a line below this one should start from: its leading
 * whitespace, plus a blank stand-in for any list marker. */
function getLineIndent(state: EditorState, pos: number): string {
  const line = state.doc.lineAt(pos)
  const marker = line.text.match(LIST_MARKER)
  if (marker) return ' '.repeat(marker[0].length)
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
  return state.doc.line(lineNumber + 1).text.trim() === ''
}

/** Reuse the blank line below instead of opening another, but reindent it. */
function reindentNextLine(view: EditorView, lineNumber: number, indent: string) {
  const nextLine = view.state.doc.line(lineNumber + 1)
  view.dispatch({
    changes: { from: nextLine.from, to: nextLine.to, insert: indent },
    selection: { anchor: nextLine.from + indent.length },
  })
}

function openLine(view: EditorView, indent: (current: string) => string) {
  const { state } = view
  const line = state.doc.lineAt(state.selection.main.head)
  const newIndent = indent(getLineIndent(state, line.from))
  if (nextLineIsBlank(state, line.number)) {
    reindentNextLine(view, line.number, newIndent)
    return
  }
  const insertPos = line.to
  view.dispatch({
    changes: { from: insertPos, insert: '\n' + newIndent },
    selection: { anchor: insertPos + 1 + newIndent.length },
  })
}

export function executeNewlineIndent(view: EditorView) {
  openLine(view, current => current + INDENT)
}

export function executeNewlineDedent(view: EditorView) {
  openLine(view, dedent)
}

export function executeCursorRight(view: EditorView) {
  const { state } = view
  const pos = state.selection.main.head
  if (pos >= state.doc.length) return
  const next = pos + 1
  const line = state.doc.lineAt(next)
  const atLineEnd = next === line.to && next > line.from
  if (atLineEnd && !/\s$/.test(line.text)) {
    view.dispatch({
      changes: { from: next, insert: ' ' },
      selection: { anchor: next + 1 },
    })
    return
  }
  view.dispatch({ selection: { anchor: next } })
}
