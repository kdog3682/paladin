// @paladin/codemirror-editor-experiment/keybindings/inoremap.ts
import { EditorView } from '@codemirror/view'
import { Extension } from '@codemirror/state'

const CHORD_TIMEOUT = 200

/**
 * Vim-style insert-mode mapping: intercepts a leader key and waits for a
 * follow-up character. If the follow-up matches a chord, the mapped action
 * fires. Otherwise both characters are inserted in order.
 *
 * Fixes the key-order bug that arises when the leader is flushed via a
 * separate dispatch and the follow-up character is handled by a subsequent
 * inputHandler — both dispatches would race. Instead we insert leader + text
 * together in a single dispatch.
 */
export function inoremap(
  leader: string,
  chords: Record<string, (view: EditorView) => void>,
): Extension {
  let pending = false
  let pendingTimeout: ReturnType<typeof setTimeout> | null = null

  const clearPending = () => {
    pending = false
    if (pendingTimeout) {
      clearTimeout(pendingTimeout)
      pendingTimeout = null
    }
  }

  return EditorView.inputHandler.of((view, _from, _to, text) => {
    if (pending) {
      clearPending()
      const action = chords[text]
      if (action) {
        action(view)
        return true
      }
      // Insert leader + current char together in one dispatch to preserve order
      view.dispatch(view.state.replaceSelection(leader + text))
      return true
    }

    if (text === leader) {
      pending = true
      pendingTimeout = setTimeout(() => {
        if (pending) {
          pending = false
          pendingTimeout = null
          view.dispatch(view.state.replaceSelection(leader))
        }
      }, CHORD_TIMEOUT)
      return true
    }

    return false
  })
}
