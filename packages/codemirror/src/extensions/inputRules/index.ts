import { abbrevs, templates } from './abbrevs'
import { codeRules, codeTemplateSource, codeWraps } from './presets/code'
import type { InputRulesConfig } from './config'
import { bracketRules, bracketWraps } from './presets/brackets'
import { markdownRules } from './presets/markdown'
import { punctuationAbbrevSource, punctuationRules, punctuationSwaps } from './presets/punctuation'

export { inputRules } from './engine'
export { applyRules, inputRuleTransaction, splitCursor } from './apply'
export { resolveConfig } from './config'
export type { InputRulesConfig, ResolvedConfig } from './config'
export { abbrevs, templates } from './abbrevs'
export type { AbbrevOptions, TemplateOptions } from './abbrevs'
export { wraps, matchWrap } from './wraps'
export { notIn, onlyIn, atLineEnd } from './guards'
export type { InputRule, Insert, RuleContext, RuleResult, WrapSpec, ResolvedWrap } from './types'

export { punctuationSwaps, punctuationRules, punctuationAbbrevSource } from './presets/punctuation'
export { markdownRules, dashRules, headingRules, HORIZONTAL_RULE } from './presets/markdown'
export { bracketWraps, bracketRules } from './presets/brackets'
export { codeRules, codeWraps, codeTemplateSource } from './presets/code'

/**
 * Every preset packed into one config: punctuation, markdown, bracket and code rules
 * plus the punctuation abbreviations and the code-fence templates. Pass it to `inputRules()` for the full
 * behaviour, or to `resolveConfig()` to drive `inputRuleTransaction` directly.
 */
export const packedInputRules: InputRulesConfig = {
  swaps: punctuationSwaps,
  wraps: [...bracketWraps, ...codeWraps],
  rules: [...punctuationRules, ...markdownRules, ...bracketRules, ...codeRules],
  abbrevs: [...abbrevs(punctuationAbbrevSource), ...templates(codeTemplateSource)],
}
