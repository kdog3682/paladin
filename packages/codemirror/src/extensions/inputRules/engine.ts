import { EditorView, keymap } from '@codemirror/view'
import { EditorSelection, Prec, StateField, type ChangeSet, type Extension } from '@codemirror/state'
import { inputRuleEvent, inputRuleTransaction } from './apply'
import { resolveConfig, type InputRulesConfig } from './config'

type UndoEntry = {
  invert: ChangeSet
  selection: EditorSelection
  typed: string
  reinsert: boolean
}

/* holds the last rule application, and only the last one */
const undoField = StateField.define<UndoEntry | null>({
  create: () => null,
  update(value, tr) {
    const event = tr.annotation(inputRuleEvent)
    if (event) {
      // a rule that only swallowed the keystroke has nothing to undo, so Backspace stays normal
      if (!tr.docChanged) return null
      return {
        invert: tr.changes.invert(tr.startState.doc),
        selection: tr.startState.selection,
        typed: event.typed,
        reinsert: event.reinsert,
      }
    }
    if (tr.docChanged || tr.selection) return null
    return value
  },
})

/* Backspace directly after a rule fired undoes the substitution and gives back the literal keystroke */
export function undoInputRule(view: EditorView): boolean {
  const entry = view.state.field(undoField, false)
  if (!entry) return false
  view.dispatch({
    changes: entry.invert,
    selection: entry.selection,
    scrollIntoView: true,
    userEvent: 'delete.inputRule',
  })
  if (entry.reinsert) {
    const { state } = view
    view.dispatch({
      ...state.changeByRange((range) => ({
        changes: { from: range.from, to: range.to, insert: entry.typed },
        range: EditorSelection.cursor(range.from + entry.typed.length),
      })),
      scrollIntoView: true,
      userEvent: 'input.type',
    })
  }
  return true
}

export function inputRules(config: InputRulesConfig): Extension {
  const resolved = resolveConfig(config)
  const precedence = config.precedence === 'highest' ? Prec.highest : Prec.high
  return [
    undoField,
    precedence(EditorView.inputHandler.of((view, _from, _to, text) => {
      if (view.composing) return false
      const spec = inputRuleTransaction(view.state, text, resolved)
      if (!spec) return false
      view.dispatch(spec)
      return true
    })),
    precedence(keymap.of([{ key: 'Backspace', run: undoInputRule }])),
  ]
}
