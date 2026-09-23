import { type Extension } from '@codemirror/state'
import { inputRules, packedInputRules } from '../../extensions/inputRules'
import { inoremap } from '../../extensions/inoremap'
import { executeCursorRight, executeNewlineDedent, executeNewlineIndent } from '../../extensions/qchord'

/** What txflow adds on top of the base extensions: the fully packed input rules
 * plus the `q`-leader insert-mode chords. */
export const TXFLOW_EXTENSIONS: Extension = [
  inputRules(packedInputRules),
  inoremap({
    'qw': executeNewlineIndent,
    'qe': executeNewlineDedent,
    'ql': executeCursorRight,
  }),
]
