import { Prec, type Extension } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { exportTextBeneathCursor } from '../../extensions/exportText'
import { inoremap } from '../../extensions/inoremap'
import { inputRules, packedInputRules } from '../../extensions/inputRules'
import { executeCursorRight, executeNewlineDedent, executeNewlineIndent } from '../../extensions/qchord'
import { executeSmartEnter } from '../../extensions/smartEnter'
import { handleSmartPaste } from '../../extensions/smartPaste'
import { toggleIndentedBlockComment, toggleIndentedLineComment } from '../../extensions/toggleComment'

const toggleBlockComment = toggleIndentedBlockComment()

/** What txflow adds on top of the base extensions: the fully packed input rules,
 * the `q`-leader insert-mode chords, smart enter, indent-aware comments,
 * export / cut below the cursor, and reflowing paste. */
export const TXFLOW_EXTENSIONS: Extension = [
  inputRules(packedInputRules),
  inoremap({
    'qw': executeNewlineIndent,
    'qe': executeNewlineDedent,
    'ql': executeCursorRight,
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
