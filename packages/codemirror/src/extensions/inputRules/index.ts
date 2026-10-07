import { abbrevs, templates } from './abbrevs'
import { codeRules, codeTemplateSource, codeWraps } from './presets/code'
import { snippetRules, snippetSource } from './presets/snippets'
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
export { wraps, matchWrap, blockWrap } from './wraps'
export { notIn, onlyIn, atLineEnd } from './guards'
export type { InputRule, Insert, RuleContext, RuleResult, WrapSpec, ResolvedWrap } from './types'

export { punctuationSwaps, punctuationRules, punctuationAbbrevSource } from './presets/punctuation'
export { markdownRules, dashRules, headingRules, checkboxRules, HORIZONTAL_RULE } from './presets/markdown'
export { bracketWraps, bracketRules } from './presets/brackets'
export { codeRules, codeWraps, codeTemplateSource } from './presets/code'
export { snippetRules, snippetSource, today, type Snippet } from './presets/snippets'

/**
 * The presets that suit any language: punctuation, bracket and code rules plus the
 * punctuation abbreviations and the code-fence templates. Markdown is left out
 * (dashes and `#` mean something else in code); `packedInputRules` adds it back.
 */
export const baseInputRules: InputRulesConfig = {
  swaps: punctuationSwaps,
  wraps: [...bracketWraps, ...codeWraps],
  rules: [...punctuationRules, ...bracketRules, ...codeRules],
  abbrevs: [...abbrevs(punctuationAbbrevSource), ...snippetRules(snippetSource), ...templates(codeTemplateSource)],
}

/**
 * Every preset packed into one config: `baseInputRules` plus the markdown rules. Pass it to
 * `inputRules()` for the full behaviour, or to `resolveConfig()` to drive `inputRuleTransaction` directly.
 */
export const packedInputRules: InputRulesConfig = {
  ...baseInputRules,
  rules: [...punctuationRules, ...markdownRules, ...bracketRules, ...codeRules],
}
