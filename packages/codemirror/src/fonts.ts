import { type Extension } from '@codemirror/state'
import { EditorView } from '@codemirror/view'

/**
 * The custom property every appearance reads its monospace stack from.
 *
 * Going through a variable rather than setting `font-family` directly keeps the
 * font layer independent of extension order: an appearance *uses* the property,
 * only the font extension *defines* it, so neither can accidentally out-specify
 * the other.
 */
export const FONT_VAR = '--pcm-font-mono'

export type FontKey = 'inconsolata' | 'ncm-mono'

/**
 * Each stack ends in system fallbacks, so an app that never imports
 * `@paladin/codemirror/fonts.css` still renders in a sane monospace.
 */
export const FONT_STACKS: Record<FontKey, string> = {
  inconsolata: "'Inconsolata', ui-monospace, SFMono-Regular, Menlo, monospace",
  'ncm-mono': "'NCM Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
}

export const DEFAULT_FONT: FontKey = 'inconsolata'

/** Reference this in an appearance instead of naming a family directly. */
export const FONT_FAMILY = `var(${FONT_VAR}, ${FONT_STACKS[DEFAULT_FONT]})`

// built once per family: a fresh EditorView.theme() on every reconfigure would
// mount a new StyleModule each time the user toggles fonts
const EXTENSIONS = Object.fromEntries(
  (Object.keys(FONT_STACKS) as FontKey[]).map((key) => [
    key,
    EditorView.theme({ '&': { [FONT_VAR]: FONT_STACKS[key] } }),
  ])
) as Record<FontKey, Extension>

/** Unknown keys fall back to DEFAULT_FONT rather than leaving the var unset. */
export function fontExtension(font: FontKey): Extension {
  return EXTENSIONS[font] ?? EXTENSIONS[DEFAULT_FONT]
}
