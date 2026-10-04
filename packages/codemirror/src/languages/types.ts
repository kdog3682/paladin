import { type Extension } from '@codemirror/state'

export type LanguageSpec = {
  /** CodeMirror language support, eg `python()`. Omit for plain text. */
  support?: Extension
  /**
   * The look this language is edited in. Omit to get DEFAULT_APPEARANCE —
   * standard languages share it, bespoke ones point at ./<name>/appearance.
   */
  appearance?: Extension
  /**
   * Behaviour specific to this language, eg txflow's input rules. Sits on top of
   * the editor's default extensions, which every language gets.
   */
  extensions?: Extension
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

/** A spec with every default filled in. */
export type ResolvedLanguage = Required<Pick<LanguageSpec, 'wrapLines' | 'placeholder'>> &
  Pick<LanguageSpec, 'support' | 'appearance' | 'extensions'>
