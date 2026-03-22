// @paladin/codemirror-editor-experiment/keybindings/qSequence.ts
// Combined handler for qw (newline-tab-enter) and qe (newline-tab-exit)
// since both intercept 'q' via inputHandler, they must share state.
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

// If cursor is at end of line and a newline follows, return info about the next line.
// We want to "reuse" the existing newline rather than creating a double.
function peekNextLine(state: EditorState, pos: number): { from: number, to: number, empty: boolean } | null {
  const line = state.doc.lineAt(pos)
  if (pos !== line.to) return null
  if (line.to >= state.doc.length) return null
  const next = state.doc.lineAt(line.to + 1)
  return { from: next.from, to: next.to, empty: next.text.trim() === '' }
}

function execute(view: EditorView, newIndent: string) {
  const { state } = view
  const { head } = state.selection.main

  const next = peekNextLine(state, head)

  if (next && next.empty) {
    // reuse the existing newline, replace the empty line content with our indent
    // from: head, to: next.to covers the \n and the empty line
    view.dispatch({
      changes: { from: head, to: next.to, insert: '\n' + newIndent },
      selection: { anchor: head + 1 + newIndent.length },
    })
  } else {
    // no newline after cursor, or next line has content — just insert
    view.dispatch({
      changes: { from: head, insert: '\n' + newIndent },
      selection: { anchor: head + 1 + newIndent.length },
    })
  }
}

function executeQw(view: EditorView) {
  const indent = getLineIndent(view.state, view.state.selection.main.head)
  execute(view, indent + INDENT)
}

function executeQe(view: EditorView) {
  const indent = getLineIndent(view.state, view.state.selection.main.head)
  execute(view, dedent(indent))
}

export function qSequence(): Extension {
  let pendingQ = false
  let pendingTimeout: ReturnType<typeof setTimeout> | null = null

  function flushQ(view: EditorView) {
    view.dispatch(view.state.replaceSelection('q'))
  }

  function clearPending() {
    pendingQ = false
    if (pendingTimeout) {
      clearTimeout(pendingTimeout)
      pendingTimeout = null
    }
  }

  return EditorView.inputHandler.of((view, from, to, text) => {
    if (pendingQ) {
      clearPending()

      if (text === 'w') {
        executeQw(view)
        return true
      }
      if (text === 'e') {
        executeQe(view)
        return true
      }

      flushQ(view)
      if (text === 'q') {
        pendingQ = true
        pendingTimeout = setTimeout(() => {
          if (pendingQ) {
            clearPending()
            flushQ(view)
          }
        }, 200)
        return true
      }
      return false
    }

    if (text === 'q') {
      pendingQ = true
      pendingTimeout = setTimeout(() => {
        if (pendingQ) {
          clearPending()
          flushQ(view)
        }
      }, 200)
      return true
    }

    return false
  })
}
