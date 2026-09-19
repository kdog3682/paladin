import { abbrevs } from './abbrevs'
import type { InputRulesConfig } from './config'
import { bracketRules, bracketWraps } from './presets/brackets'
import { markdownRules } from './presets/markdown'
import { punctuationAbbrevSource, punctuationRules, punctuationSwaps } from './presets/punctuation'

export { inputRules, undoInputRule } from './engine'
export { applyRules, inputRuleTransaction, inputRuleEvent, splitCursor } from './apply'
export { resolveConfig } from './config'
export type { InputRulesConfig, ResolvedConfig } from './config'
export { abbrevs } from './abbrevs'
export type { AbbrevOptions } from './abbrevs'
export { wraps, matchWrap } from './wraps'
export { notIn, onlyIn, atLineEnd } from './guards'
export type { InputRule, Insert, RuleContext, RuleResult, WrapSpec, ResolvedWrap } from './types'

export { punctuationSwaps, punctuationRules, punctuationAbbrevSource } from './presets/punctuation'
export { markdownRules, dashRules, headingRules, HORIZONTAL_RULE } from './presets/markdown'
export { bracketWraps, bracketRules } from './presets/brackets'

/**
 * Every preset packed into one config: punctuation, markdown and bracket rules
 * plus the punctuation abbreviations. Pass it to `inputRules()` for the full
 * behaviour, or to `resolveConfig()` to drive `inputRuleTransaction` directly.
 */
export const packedInputRules: InputRulesConfig = {
  swaps: punctuationSwaps,
  wraps: bracketWraps,
  rules: [...punctuationRules, ...markdownRules, ...bracketRules],
  abbrevs: abbrevs(punctuationAbbrevSource),
}
