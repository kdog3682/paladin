import type { EditorView } from '@codemirror/view'
import { EditorState } from '@codemirror/state'

const INDENT = '  '

/** A leading `- `, `* `, `+ `, `1. ` or `1) `, captured as indent + marker. */
const LIST_MARKER = /^([ \t]*)((?:[-*+]|\d+[.)])[ \t]+)/

function getLineIndent(state: EditorState, pos: number): string {
  const line = state.doc.lineAt(pos)
  const match = line.text.match(/^([ \t]*)/)
  return match ? match[1] : ''
}

/** The list marker to repeat on the line below, or '' for a plain line. */
function getLineMarker(state: EditorState, pos: number): string {
  const line = state.doc.lineAt(pos)
  return line.text.match(LIST_MARKER)?.[2] ?? ''
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

/**
 * Open the line below at `indent(current indentation)`, carrying down the
 * current line's list marker so a bullet continues as a bullet. A blank line
 * below is reused rather than pushed down, but is rewritten the same way.
 */
function openLine(view: EditorView, indent: (current: string) => string) {
  const { state } = view
  const line = state.doc.lineAt(state.selection.main.head)
  const prefix = indent(getLineIndent(state, line.from)) + getLineMarker(state, line.from)
  const reuse = nextLineIsBlank(state, line.number) ? state.doc.line(line.number + 1) : null
  const from = reuse ? reuse.from : line.to
  const insert = reuse ? prefix : '\n' + prefix
  view.dispatch({
    changes: { from, to: reuse ? reuse.to : line.to, insert },
    selection: { anchor: from + insert.length },
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
