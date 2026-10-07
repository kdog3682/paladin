import { EditorState, Prec, Transaction, type Extension } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { enterNormalMode, normalCommands, visualCommands, type NormalCommands } from './commands'
import { handleNormalKey } from './keys'
import { getVim, initialVimState, isReadOnlyMode, vimEdit, vimField, type VimMode } from './state'
import { blockCursor, modeClass, vimPanel, vimTheme } from './view'

export { cycleToken, cycleWord, DEFAULT_CYCLES, incrementNumber } from './cycleWord'
export {
  enterNormalMode,
  insertCommand,
  jump,
  NORMAL_COMMANDS,
  normalCommands,
  type NormalCommand,
  type NormalCommands,
  VISUAL_COMMANDS,
  visualCommands,
} from './commands'
export { findMatch, keywordAt } from './search'
export { getVim, setVim, vimEdit, vimField, vimJump } from './state'
export type { VimJumps, VimMode, VimRegister, VimSearch, VimState } from './state'
export { wrapSelection } from './wrap'

export type VimOpts = {
  /* the mode the editor starts in, defaults to insert */
  startMode?: VimMode
  /* extra normal-mode bindings merged over the defaults, ie `Space` */
  commands?: NormalCommands
  /* extra visual-mode bindings merged over the defaults */
  visual?: NormalCommands
}

// normal and visual mode are read-only for the user: typing, paste, drop and keymap edits
// are rejected. vim's own edits, undo / redo and programmatic changes (no userEvent) still
// go through. EditorState.readOnly isn't used because @codemirror/commands' undo refuses to run under it
const readOnlyOutsideInsert = EditorState.transactionFilter.of(tr => {
  const mode = getVim(tr.startState)?.mode
  if (!tr.docChanged || !mode || !isReadOnlyMode(mode)) return tr
  if (tr.annotation(vimEdit) || tr.isUserEvent('undo') || tr.isUserEvent('redo')) return tr
  return tr.annotation(Transaction.userEvent) === undefined ? tr : []
})

/** a small vim layer: Esc enters normal mode (block cursor, read-only), `i` / `a` / `o` / `O`
 * leave it, `v` enters visual mode */
export const vim = (opts: VimOpts = {}): Extension => [
  ...(opts.commands ? [normalCommands.of(opts.commands)] : []),
  ...(opts.visual ? [visualCommands.of(opts.visual)] : []),
  vimField.init(() => initialVimState(opts.startMode ?? 'insert')),
  readOnlyOutsideInsert,
  modeClass,
  blockCursor,
  vimPanel,
  vimTheme,
  Prec.highest(EditorView.domEventHandlers({ keydown: handleNormalKey })),
  // below autocomplete's Prec.highest keymap, so Esc closes an open completion first
  Prec.high(keymap.of([{ key: 'Escape', run: enterNormalMode }])),
]
