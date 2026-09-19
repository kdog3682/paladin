import { type Extension } from '@codemirror/state'
import { inputRules, packedInputRules } from '../../extensions/inputRules'

/** What txflow adds on top of the base extensions: the fully packed input rules. */
export const TXFLOW_EXTENSIONS: Extension = inputRules(packedInputRules)
