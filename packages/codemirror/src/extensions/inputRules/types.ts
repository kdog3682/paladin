import type { EditorState, SelectionRange } from '@codemirror/state'

export type RuleContext = {
  /* the editor state before the typed character is applied */
  state: EditorState
  /* the range the typed character would replace */
  range: SelectionRange
  /* the character after the swap layer, ie what the user meant to type */
  char: string
  /* the physical character the user actually pressed */
  typed: string
  /* line text from the line start up to `range.from` */
  before: string
  /* line text from `range.to` to the end of that line */
  after: string
}

/* a `|` in an insert string marks where the cursor lands; write `\|` for a literal pipe */
export type Insert = string | ((match: RegExpMatchArray, ctx: RuleContext) => string)

export type InputRule = {
  /* the logical character(s) that trigger the rule; a multi-char string is treated as a set */
  on: string | string[]
  /* tested against the line text before the cursor; must match at the cursor, and match[0] is replaced */
  before?: RegExp
  /* tested against the line text after the cursor; never consumed */
  after?: RegExp
  /* extra guard, eg a syntax-tree check */
  when?: (ctx: RuleContext) => boolean
  /* the replacement for match[0] plus the typed character */
  insert: Insert
}

export type WrapSpec = {
  /* the delimiters, eg ['(', ')'] */
  pair: [string, string]
  /* characters that trigger this wrap; defaults to both delimiters */
  triggers?: string[]
  /* 'auto' wraps a multi-line selection as an indented block, true always, false never */
  block?: boolean | 'auto'
}

export type ResolvedWrap = Required<WrapSpec>

export type RuleResult = {
  /* the replacement, in coordinates of the document before the change */
  changes: { from: number, to: number, insert: string }
  /* the selection for this range once the change is applied */
  range: SelectionRange
  /* false when Backspace should only revert, not re-insert the typed character */
  reinsert: boolean
}
