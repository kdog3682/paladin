import { type Command } from '@codemirror/view'
import { executeBracketEnter } from './bracket'
import { insertIndentedNewline } from './indentNewline'
import { executeWrap } from './wrap'

export { insertIndentedNewline } from './indentNewline'
export { executeWrap } from './wrap'

/** special-case handlers, tried in order. the first to return true wins */
export const SMART_ENTER_HANDLERS: Command[] = [
  executeWrap,
  executeBracketEnter,
]

/** run the first matching handler, otherwise an indent-keeping newline */
export const executeSmartEnter: Command = (view) =>
  SMART_ENTER_HANDLERS.some((run) => run(view)) || insertIndentedNewline(view)
