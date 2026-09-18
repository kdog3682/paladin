import { EditorSelection, type EditorState, type SelectionRange } from '@codemirror/state'
import { getIndentUnit, indentString } from '@codemirror/language'
import type { ResolvedConfig } from './config'
import type { RuleResult, WrapSpec } from './types'

/* shorthand builder: wraps('()', '[]', { pair: ['<', '>'], block: false }) */
export function wraps(...specs: (WrapSpec | string)[]): (WrapSpec | string)[] {
  return specs
}

function inlineWrap(state: EditorState, range: SelectionRange, open: string, close: string): RuleResult {
  const inner = state.sliceDoc(range.from, range.to)
  const anchor = range.from + open.length
  return {
    changes: { from: range.from, to: range.to, insert: open + inner + close },
    range: EditorSelection.range(anchor, anchor + inner.length),
    reinsert: false,
  }
}

function blockWrap(state: EditorState, range: SelectionRange, open: string, close: string): RuleResult {
  const startLine = state.doc.lineAt(range.from)
  const endLine = state.doc.lineAt(range.to)
  const from = startLine.from
  const to = endLine.to
  const base = /^[ \t]*/.exec(startLine.text)![0]
  const unit = indentString(state, getIndentUnit(state))
  const body = state.sliceDoc(from, to)
    .split('\n')
    .map((line) => (line.trim() === '' ? line : unit + line))
    .join('\n')
  const head = base + open + '\n'
  return {
    changes: { from, to, insert: head + body + '\n' + base + close },
    range: EditorSelection.range(from + head.length, from + head.length + body.length),
    reinsert: false,
  }
}

export function matchWrap(
  state: EditorState,
  range: SelectionRange,
  typed: string,
  char: string,
  config: ResolvedConfig,
): RuleResult | null {
  const spec = config.byTrigger.get(typed) ?? config.byTrigger.get(char)
  if (!spec) return null
  const [open, close] = spec.pair
  const multiline = state.doc.lineAt(range.to).number > state.doc.lineAt(range.from).number
  const asBlock = spec.block === true || (spec.block === 'auto' && multiline)
  return asBlock
    ? blockWrap(state, range, open, close)
    : inlineWrap(state, range, open, close)
}
