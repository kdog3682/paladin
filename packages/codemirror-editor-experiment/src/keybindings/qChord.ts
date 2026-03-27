// @paladin/codemirror-editor-experiment/keybindings/qChord.ts
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

const CHORD_TIMEOUT = 200

const CHORDS: Record<string, (view: EditorView) => void> = {
  w: executeNewlineIndent,
  e: executeNewlineDedent,
}

export function qChord(): Extension {
  let pendingQ = false
  let pendingTimeout: ReturnType<typeof setTimeout> | null = null

  const clearPending = () => {
    pendingQ = false
    if (pendingTimeout) {
      clearTimeout(pendingTimeout)
      pendingTimeout = null
    }
  }

  return EditorView.inputHandler.of((view, _from, _to, text) => {
    if (pendingQ) {
      clearPending()

      const action = CHORDS[text]
      if (action) {
        action(view)
        return true
      }

      // not a chord — flush the buffered 'q' then let current char through
      view.dispatch(view.state.replaceSelection('q'))
      return false
    }

    if (text === 'q') {
      pendingQ = true
      pendingTimeout = setTimeout(() => {
        if (pendingQ) {
          pendingQ = false
          pendingTimeout = null
          view.dispatch(view.state.replaceSelection('q'))
        }
      }, CHORD_TIMEOUT)
      return true
    }

    return false
  })
}
