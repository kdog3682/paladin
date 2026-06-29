// @paladin/cme/keybindings/qeNewlineTabExit.ts
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
  if (pos === line.to && line.to < state.doc.length) {
    return true
  }
  return false
}

function dedent(indent: string): string {
  if (indent.endsWith(INDENT)) {
    return indent.slice(0, -INDENT.length)
  }
  if (indent.endsWith('\t')) {
    return indent.slice(0, -1)
  }
  return ''
}

function executeQe(view: EditorView) {
  const { state } = view
  const { head } = state.selection.main
  const currentIndent = getLineIndent(state, head)
  const newIndent = dedent(currentIndent)

  view.dispatch({
    changes: { from: head, insert: '\n' + newIndent },
    selection: { anchor: head + 1 + newIndent.length },
  })
}

export function qeNewlineTabExit(): Extension {
  let pendingQ = false
  let pendingTimeout: ReturnType<typeof setTimeout> | null = null

  return EditorView.inputHandler.of((view, from, to, text) => {
    if (pendingQ) {
      pendingQ = false
      if (pendingTimeout) {
        clearTimeout(pendingTimeout)
        pendingTimeout = null
      }

      if (text === 'e') {
        executeQe(view)
        return true
      }

      // not 'e' — flush the buffered 'q' then handle current char normally
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
      return true
    }

    return false
  })
}
