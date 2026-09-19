import { DEFAULT_APPEARANCE } from './default/appearance'
import { TXFLOW } from './txflow'
import { type LanguageMap, type ResolvedLanguage } from './types'

export type { LanguageMap, LanguageSpec, ResolvedLanguage } from './types'

/** The language the editor opens in when `language` is not given. */
export const DEFAULT_LANGUAGE = 'txflow'

/**
 * The default language pack, used by the editor when `languages` is not given.
 * Standard code languages are added by the consumer (so the parsers stay out of
 * this bundle) and inherit the default appearance by leaving `appearance` unset:
 *
 *   const LANGUAGES = { ...BUILTIN_LANGUAGES, python: { support: python() } }
 */
export const BUILTIN_LANGUAGES: LanguageMap = {
  txflow: TXFLOW,
  text: {},
}

/** Fills in the defaults for a language key, including unknown ones. */
export function resolveLanguage(
  key: string,
  languages: LanguageMap = BUILTIN_LANGUAGES
): ResolvedLanguage {
  const spec = languages[key] ?? {}
  return {
    support: spec.support,
    appearance: spec.appearance ?? DEFAULT_APPEARANCE,
    extensions: spec.extensions,
    font: spec.font,
    wrapLines: spec.wrapLines ?? true,
    placeholder: spec.placeholder ?? `start typing in ${key}`,
  }
}
