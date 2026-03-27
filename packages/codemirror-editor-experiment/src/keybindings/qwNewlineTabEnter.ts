// @paladin/codemirror-editor-experiment/keybindings/qwNewlineTabEnter.ts
import { EditorView } from '@codemirror/view'
import { Extension, EditorState } from '@codemirror/state'

const INDENT = '  '

function getLineIndent(state: EditorState, pos: number): string {
  const line = state.doc.lineAt(pos)
  const match = line.text.match(/^(\s*)/)
  return match ? match[1] : ''
}

function hasNewlineAfter(state: EditorState, pos: number): boolean {
  const line = state.doc.lineAt(pos)
  // cursor is at end of line and there's a next line
  if (pos === line.to && line.to < state.doc.length) {
    return true
  }
  return false
}

function executeQw(view: EditorView) {
  const { state } = view
  const { head } = state.selection.main
  const currentIndent = getLineIndent(state, head)
  const newIndent = currentIndent + INDENT

  view.dispatch({
    changes: { from: head, insert: '\n' + newIndent },
    selection: { anchor: head + 1 + newIndent.length },
  })
}

export function qwNewlineTabEnter(): Extension {
  let pendingQ = false
  let pendingTimeout: ReturnType<typeof setTimeout> | null = null

  return EditorView.inputHandler.of((view, from, to, text) => {
    if (pendingQ) {
      pendingQ = false
      if (pendingTimeout) {
        clearTimeout(pendingTimeout)
        pendingTimeout = null
      }

      if (text === 'w') {
        executeQw(view)
        return true
      }

      // not 'w' — flush the buffered 'q' then handle current char normally
      view.dispatch(view.state.replaceSelection('q'))
      return false
    }

    if (text === 'q') {
      pendingQ = true
      pendingTimeout = setTimeout(() => {
        if (pendingQ) {
          pendingQ = false
          view.dispatch(view.state.replaceSelection('q'))
        }
      }, 200)
      return true // suppress 'q' for now
    }

    return false
  })
}
