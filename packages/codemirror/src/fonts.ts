import { type Extension } from '@codemirror/state'
import { EditorView } from '@codemirror/view'

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

// Appearances never mention a family; this is the only place one is set. It
// targets .cm-scroller because CodeMirror's base theme pins `monospace` there,
// which would beat a value set on `&` and merely inherited.
//
// Built once per family: a fresh EditorView.theme() on every reconfigure would
// mount a new StyleModule each time the user toggles fonts.
const EXTENSIONS = Object.fromEntries(
  (Object.keys(FONT_STACKS) as FontKey[]).map((key) => [
    key,
    EditorView.theme({ '.cm-scroller': { fontFamily: FONT_STACKS[key] } }),
  ])
) as Record<FontKey, Extension>

/** Unknown keys fall back to DEFAULT_FONT rather than leaving the editor on bare `monospace`. */
export function fontExtension(font: FontKey): Extension {
  return EXTENSIONS[font] ?? EXTENSIONS[DEFAULT_FONT]
}
