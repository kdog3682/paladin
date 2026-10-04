import { type Extension } from '@codemirror/state'
import { headingFold } from '../../extensions/headingFold'
import { inputRules, markdownRules } from '../../extensions/inputRules'

/** What txflow adds on top of the editing defaults: the markdown input rules (dash
 * bullets and rules, headings), and `#` heading folds with a gutter arrow. */
export const TXFLOW_EXTENSIONS: Extension = [
  headingFold(),
  inputRules({ rules: markdownRules }),
]
