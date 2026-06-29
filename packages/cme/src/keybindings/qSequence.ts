// @paladin/cme/keybindings/qSequence.ts
import { EditorView } from '@codemirror/view'
import { Extension, EditorState } from '@codemirror/state'

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

function isAtLineEnd(state: EditorState, pos: number): boolean {
  const line = state.doc.lineAt(pos)
  return pos === line.to
}

function executeQw(view: EditorView) {
  const { state } = view
  const { head } = state.selection.main

  // only trigger at end of line
  if (!isAtLineEnd(state, head)) return false

  const currentIndent = getLineIndent(state, head)
  const newIndent = currentIndent + INDENT

  view.dispatch({
    changes: { from: head, insert: '\n' + newIndent },
    selection: { anchor: head + 1 + newIndent.length },
  })
  return true
}

function executeQe(view: EditorView) {
  const { state } = view
  const { head } = state.selection.main

  // only trigger at end of line
  if (!isAtLineEnd(state, head)) return false

  const currentIndent = getLineIndent(state, head)
  const newIndent = dedent(currentIndent)

  view.dispatch({
    changes: { from: head, insert: '\n' + newIndent },
    selection: { anchor: head + 1 + newIndent.length },
  })
  return true
}

export function qSequence(): Extension {
  let pendingQ = false
  let pendingTimeout: ReturnType<typeof setTimeout> | null = null

  function flushQ(view: EditorView) {
    pendingQ = false
    if (pendingTimeout) {
      clearTimeout(pendingTimeout)
      pendingTimeout = null
    }
    view.dispatch(view.state.replaceSelection('q'))
  }

  return EditorView.inputHandler.of((view, from, to, text) => {
    if (pendingQ) {
      pendingQ = false
      if (pendingTimeout) {
        clearTimeout(pendingTimeout)
        pendingTimeout = null
      }

      if (text === 'w') {
        if (executeQw(view)) return true
        // not at line end — flush q and let w through normally
        flushQ(view)
        return false
      }

      if (text === 'e') {
        if (executeQe(view)) return true
        flushQ(view)
        return false
      }

      // not w or e — flush the buffered q, let current char through
      flushQ(view)
      return false
    }

    if (text === 'q') {
      pendingQ = true
      pendingTimeout = setTimeout(() => {
        if (pendingQ) flushQ(view)
      }, 200)
      return true
    }

    return false
  })
}
