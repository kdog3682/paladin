import { type Extension } from '@codemirror/state'
import { DEFAULT_APPEARANCE } from './appearance/default'
import { type FontKey } from './fonts'
import { TXFLOW_APPEARANCE } from './appearance/txflow'

export type LanguageSpec = {
  /** CodeMirror language support, eg `python()`. Omit for plain text. */
  support?: Extension
  /**
   * The look this language is edited in. Omit to get DEFAULT_APPEARANCE —
   * standard languages share it, bespoke ones point at ./appearance/<name>.
   */
  appearance?: Extension
  /**
   * Font this language prefers. The editor's `font` prop overrides it, so treat
   * this as a default rather than a lock.
   */
  font?: FontKey
  /** Soft-wrap long lines. Defaults to true. */
  wrapLines?: boolean
  /** Shown when the document is empty. Defaults to `start typing in <key>`. */
  placeholder?: string
}

/**
 * Keyed by the `language` prop. Hoist your map to module scope: a new object
 * every render makes the editor reconfigure on every render.
 */
export type LanguageMap = Record<string, LanguageSpec>

/**
 * Languages that ship with the package. Standard code languages are added by
 * the consumer (so the parsers stay out of this bundle) and inherit the default
 * appearance by leaving `appearance` unset:
 *
 *   const LANGUAGES = { ...BUILTIN_LANGUAGES, python: { support: python() } }
 */
export const BUILTIN_LANGUAGES: LanguageMap = {
  txflow: {
    appearance: TXFLOW_APPEARANCE,
    wrapLines: true,
    placeholder: 'start writing',
  },
  text: {},
}

/** A spec with every default filled in. */
export type ResolvedLanguage = Required<Pick<LanguageSpec, 'wrapLines' | 'placeholder'>> &
  Pick<LanguageSpec, 'support' | 'appearance' | 'font'>

/** Fills in the defaults for a language key, including unknown ones. */
export function resolveLanguage(
  key: string,
  languages: LanguageMap = BUILTIN_LANGUAGES
): ResolvedLanguage {
  const spec = languages[key] ?? {}
  return {
    support: spec.support,
    appearance: spec.appearance ?? DEFAULT_APPEARANCE,
    font: spec.font,
    wrapLines: spec.wrapLines ?? true,
    placeholder: spec.placeholder ?? `start typing in ${key}`,
  }
}
