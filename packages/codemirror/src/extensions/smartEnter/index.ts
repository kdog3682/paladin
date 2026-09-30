import { type Command } from '@codemirror/view'
import { executeBracketEnter } from './bracket'
import { insertIndentedNewline } from './indentNewline'

export { insertIndentedNewline } from './indentNewline'

/** special-case handlers, tried in order. the first to return true wins.
 * the `wrap foo` transform used to live here; it is visual mode's `w` now */
export const SMART_ENTER_HANDLERS: Command[] = [
  executeBracketEnter,
]

/** run the first matching handler, otherwise an indent-keeping newline */
export const executeSmartEnter: Command = (view) =>
  SMART_ENTER_HANDLERS.some((run) => run(view)) || insertIndentedNewline(view)
