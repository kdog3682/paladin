// @paladin/codemirror-editor-experiment/keybindings/inoremap.ts
import { EditorView } from '@codemirror/view'
import { Extension } from '@codemirror/state'

const CHORD_TIMEOUT = 200

/**
 * Vim-style insert-mode chord mapping.
 *
 * Pass a flat map of full sequences to actions, e.g. { 'qw': fn, 'zf': fn }.
 * Leaders are derived from the first character of each key.
 *
 * When a leader is typed it is held; if the next character completes a chord
 * the action fires. If not, leader + char are inserted together in a single
 * dispatch — fixing the ordering bug that occurred when two separate dispatches
 * raced each other.
 */
export function inoremap(
  chords: Record<string, (view: EditorView) => void>,
): Extension {
  const leaders = new Set(Object.keys(chords).map(k => k[0]))

  let pendingLeader: string | null = null
  let pendingTimeout: ReturnType<typeof setTimeout> | null = null

  const clearPending = () => {
    pendingLeader = null
    if (pendingTimeout) {
      clearTimeout(pendingTimeout)
      pendingTimeout = null
    }
  }

  const flushLeader = (view: EditorView) => {
    if (pendingLeader !== null) {
      const leader = pendingLeader
      clearPending()
      view.dispatch(view.state.replaceSelection(leader))
    }
  }

  return [
    // Flush buffered leader on Enter so it doesn't leak into the next line
    EditorView.domEventHandlers({
      keydown(event, view) {
        if (event.key === 'Enter' && pendingLeader !== null) {
          flushLeader(view)
        }
      },
    }),
    EditorView.inputHandler.of((view, _from, _to, text) => {
      if (pendingLeader !== null) {
        const leader = pendingLeader
        clearPending()
        const action = chords[leader + text]
        if (action) {
          action(view)
          return true
        }
        // Insert both chars together in one dispatch to preserve order
        view.dispatch(view.state.replaceSelection(leader + text))
        return true
      }

      if (leaders.has(text)) {
        pendingLeader = text
        pendingTimeout = setTimeout(() => {
          if (pendingLeader !== null) {
            const leader = pendingLeader
            pendingLeader = null
            pendingTimeout = null
            view.dispatch(view.state.replaceSelection(leader))
          }
        }, CHORD_TIMEOUT)
        return true
      }

      return false
    }),
  ]
}
