import { isolateHistory } from '@codemirror/commands'
import type { EditorView } from '@codemirror/view'
import { blockWrap } from '../inputRules/wraps'
import { clampNormal, firstNonBlank } from './motions'
import { setVim, vimEdit } from './state'

/**
 * Wrap the whole lines the selection touches in `<word> { … }`, one indent deeper:
 * `flex` over `a` / `b` gives `flex {` / `  a` / `  b` / `}`. Leaves visual mode with
 * the cursor on the first line of the body. A blank word is a no-op.
 */
export const wrapSelection = (view: EditorView, word: string) => {
  const name = word.trim()
  if (!name) return
  const { changes, range } = blockWrap(view.state, view.state.selection.main, `${name} {`, '}')
  const doc = view.state.changes(changes).apply(view.state.doc)
  view.dispatch({
    changes,
    selection: { anchor: clampNormal(doc, firstNonBlank(doc.lineAt(range.from))) },
    annotations: [vimEdit.of(true), isolateHistory.of('full')],
    effects: setVim.of({ mode: 'normal', visualLine: false, pending: '', prompt: null }),
    userEvent: 'input.wrap',
    scrollIntoView: true,
  })
}
