import { EditorView } from '@codemirror/view'
import { Prec, type Extension } from '@codemirror/state'
import { inputRuleTransaction } from './apply'
import { resolveConfig, type InputRulesConfig } from './config'

/* Rules are one-way: Backspace after a rule fired is an ordinary delete, it never reverts or re-types */
export function inputRules(config: InputRulesConfig): Extension {
  const resolved = resolveConfig(config)
  const precedence = config.precedence === 'highest' ? Prec.highest : Prec.high
  return precedence(EditorView.inputHandler.of((view, _from, _to, text) => {
    if (view.composing) return false
    const spec = inputRuleTransaction(view.state, text, resolved)
    if (!spec) return false
    view.dispatch(spec)
    return true
  }))
}
