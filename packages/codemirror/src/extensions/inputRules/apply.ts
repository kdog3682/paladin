import { EditorSelection, type EditorState, type SelectionRange, type TransactionSpec } from '@codemirror/state'
import type { ResolvedConfig } from './config'
import type { InputRule, RuleContext, RuleResult } from './types'
import { matchWrap } from './wraps'

const EMPTY_MATCH = Object.assign([''] as unknown as RegExpMatchArray, { index: 0, input: '' })

/* splits an insert string on its unescaped cursor marker */
export function splitCursor(raw: string): { text: string, cursor: number } {
  let text = ''
  let cursor = -1
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i]
    if (c === '\\' && raw[i + 1] === '|') {
      text += '|'
      i++
      continue
    }
    if (c === '|' && cursor < 0) {
      cursor = text.length
      continue
    }
    text += c
  }
  return { text, cursor: cursor < 0 ? text.length : cursor }
}

function matchRule(rule: InputRule, ctx: RuleContext): RegExpMatchArray | null {
  let match = EMPTY_MATCH
  if (rule.before) {
    const found = ctx.before.match(rule.before)
    // the match has to end at the cursor, so a rule cannot reach behind itself
    if (!found || (found.index ?? 0) + found[0].length !== ctx.before.length) return null
    match = found
  }
  if (rule.after && !rule.after.test(ctx.after)) return null
  if (rule.when && !rule.when(ctx)) return null
  return match
}

export function applyRules(
  state: EditorState,
  range: SelectionRange,
  typed: string,
  config: ResolvedConfig,
): RuleResult | null {
  const swapped = config.swaps[typed]
  const char = swapped ?? typed

  if (!range.empty) {
    const wrapped = matchWrap(state, range, typed, char, config)
    if (wrapped) return wrapped
  }

  // a swapped character is the literal the user asked for, so it never runs the
  // rules of the key it landed on: shift+9 gives a bare `9`, not the `9` pair rule
  if (swapped !== undefined) {
    return {
      changes: { from: range.from, to: range.to, insert: swapped },
      range: EditorSelection.cursor(range.from + swapped.length),
    }
  }

  const startLine = state.doc.lineAt(range.from)
  const endLine = range.to <= startLine.to ? startLine : state.doc.lineAt(range.to)
  const ctx: RuleContext = {
    state,
    range,
    char,
    typed,
    before: startLine.text.slice(0, range.from - startLine.from),
    after: endLine.text.slice(range.to - endLine.from),
  }

  for (const rule of config.byChar.get(char) ?? []) {
    const match = matchRule(rule, ctx)
    if (!match) continue
    const raw = typeof rule.insert === 'function' ? rule.insert(match, ctx) : rule.insert
    const { text, cursor } = splitCursor(raw)
    const from = range.from - match[0].length
    return {
      changes: { from, to: Math.min(range.to + (rule.skip ?? 0), endLine.to), insert: text },
      range: EditorSelection.cursor(from + cursor),
    }
  }

  // nothing matched, but the swap layer still has to land its character
  return null
}

/* the whole pipeline for one typed character, across every selection range */
export function inputRuleTransaction(
  state: EditorState,
  typed: string,
  config: ResolvedConfig,
): TransactionSpec | null {
  if (typed.length !== 1 || state.readOnly) return null
  const results = state.selection.ranges.map((range) => applyRules(state, range, typed, config))
  if (!results.some((result) => result !== null)) return null

  let index = 0
  const spec = state.changeByRange((range) => {
    const result = results[index++]
    // another range matched, so the default insertion is suppressed for every range — do it here
    if (!result) {
      return {
        changes: { from: range.from, to: range.to, insert: typed },
        range: EditorSelection.cursor(range.from + typed.length),
      }
    }
    return { changes: result.changes, range: result.range }
  })
  return {
    ...spec,
    scrollIntoView: true,
    userEvent: 'input.type',
  }
}
