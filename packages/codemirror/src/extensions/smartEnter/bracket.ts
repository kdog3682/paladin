import { insertNewlineAndIndent } from '@codemirror/commands'
import { type Command } from '@codemirror/view'

/** enter right after an opener defers to the standard command, which uses bracketIndent and opens up `{|}` */
export const executeBracketEnter: Command = (view) => {
  const { state } = view
  const afterOpener = state.selection.ranges.every(
    (range) => range.empty && range.from > 0 && '([{'.includes(state.doc.sliceString(range.from - 1, range.from)),
  )
  return afterOpener && insertNewlineAndIndent(view)
}
