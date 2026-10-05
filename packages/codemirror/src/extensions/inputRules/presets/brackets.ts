import type { InputRule, WrapSpec } from '../types'

/* '9' is the logical paren, because the punctuation swaps send '(' to '9' */
export const bracketWraps: WrapSpec[] = [
  { pair: ['(', ')'], triggers: ['9', '(', ')'], block: 'auto' },
  { pair: ['[', ']'], block: 'auto' },
  { pair: ['{', '}'], block: 'auto' },
]

/* with nothing selected, '9' opens an empty pair around the cursor, unless an opener or quote
 * follows: then it is a bare '(' so it can prefix existing text instead of leaving a stray ')' */
export const bracketRules: InputRule[] = [
  { on: '9', after: /^[(\[{"']/, insert: '(' },
  { on: '9', insert: '(|)' },
]
