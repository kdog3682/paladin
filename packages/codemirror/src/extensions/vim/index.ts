import { EditorState, Prec, Transaction, type Extension } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { enterNormalMode, normalCommands, type NormalCommands } from './commands'
import { handleNormalKey } from './keys'
import { getVim, initialVimState, vimEdit, vimField, type VimMode } from './state'
import { blockCursor, modeClass, vimPanel, vimTheme } from './view'

export { cycleToken, cycleWord, DEFAULT_CYCLES, incrementNumber } from './cycleWord'
export { enterNormalMode, jump, NORMAL_COMMANDS, normalCommands } from './commands'
export { findMatch, keywordAt } from './search'
export { getVim, setVim, vimEdit, vimField } from './state'
export type { VimMode, VimSearch, VimState } from './state'

export type VimOpts = {
  /* the mode the editor starts in, defaults to insert */
  startMode?: VimMode
  /* extra normal-mode bindings merged over the defaults, ie `Space` */
  commands?: NormalCommands
}

// normal mode is read-only for the user: typing, paste, drop and keymap edits are rejected.
// vim's own edits, undo / redo and programmatic changes (no userEvent) still go through.
// EditorState.readOnly isn't used because @codemirror/commands' undo refuses to run under it
const readOnlyInNormalMode = EditorState.transactionFilter.of(tr => {
  if (!tr.docChanged || getVim(tr.startState)?.mode !== 'normal') return tr
  if (tr.annotation(vimEdit) || tr.isUserEvent('undo') || tr.isUserEvent('redo')) return tr
  return tr.annotation(Transaction.userEvent) === undefined ? tr : []
})

/** a small vim layer: Esc enters normal mode (block cursor, read-only), `i` / `a` / `o` / `O` leave it */
export const vim = (opts: VimOpts = {}): Extension => [
  ...(opts.commands ? [normalCommands.of(opts.commands)] : []),
  vimField.init(() => initialVimState(opts.startMode ?? 'insert')),
  readOnlyInNormalMode,
  modeClass,
  blockCursor,
  vimPanel,
  vimTheme,
  Prec.highest(EditorView.domEventHandlers({ keydown: handleNormalKey })),
  // below autocomplete's Prec.highest keymap, so Esc closes an open completion first
  Prec.high(keymap.of([{ key: 'Escape', run: enterNormalMode }])),
]
