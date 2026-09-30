import { Prec, type Extension } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { exportTextBeneathCursor } from '../../extensions/exportText'
import { inoremap } from '../../extensions/inoremap'
import { inputRules, packedInputRules } from '../../extensions/inputRules'
import {
  executeCursorRight,
  executeJoinPrevious,
  executeNewlineDedent,
  executeNewlineIndent,
  executeWrapParens,
} from '../../extensions/qchord'
import { executeSmartEnter } from '../../extensions/smartEnter'
import { handleSmartPaste } from '../../extensions/smartPaste'
import { toggleIndentedBlockComment, toggleIndentedLineComment } from '../../extensions/toggleComment'
import { cycleWord, insertCommand, vim } from '../../extensions/vim'

const toggleBlockComment = toggleIndentedBlockComment()

/** What txflow adds on top of the base extensions: the fully packed input rules,
 * the `q`-leader chords (insert mode, plus `qw` / `qe` in normal mode), smart enter, indent-aware comments,
 * export / cut below the cursor, reflowing paste, and a vim normal mode on Esc
 * (with visual mode on `v`, whose `w` wraps the selection in a named block). */
export const TXFLOW_EXTENSIONS: Extension = [
  vim({
    commands: {
      'Space': cycleWord(),
      'Shift-Space': cycleWord({ dir: -1 }),
      // the qw / qe insert chords, reachable from normal mode too: they open the line and
      // leave you typing on it, so they drop into insert mode the way `o` does
      'q w': insertCommand(executeNewlineIndent),
      'q e': insertCommand(executeNewlineDedent),
    },
  }),
  inputRules(packedInputRules),
  inoremap({
    'qw': executeNewlineIndent,
    'qe': executeNewlineDedent,
    'ql': executeCursorRight,
    'qd': executeJoinPrevious,
    'qp': executeWrapParens,
  }),
  Prec.high(keymap.of([
    { key: 'Enter', run: executeSmartEnter },
    { key: 'Mod-/', run: toggleIndentedLineComment() },
    { key: 'Mod-Shift-/', run: toggleBlockComment },
    // some layouts report shift-/ as `?`
    { key: 'Mod-?', run: toggleBlockComment },
    { key: 'Mod-e', run: exportTextBeneathCursor({ includeCursorLine: true }) },
    { key: 'Mod-Shift-e', run: exportTextBeneathCursor({ includeCursorLine: true, delete: true }) },
  ])),
  EditorView.domEventHandlers({
    paste: handleSmartPaste({ maxWidth: 80 }),
  }),
]
