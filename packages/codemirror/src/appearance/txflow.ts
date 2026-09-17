import { EditorView } from '@codemirror/view'
import { FONT_FAMILY } from '../fonts'

/**
 * The txflow writing surface: generous margins, tight leading, no gutters.
 *
 * Trimmed from the old DEFAULT_THEME:
 * - `height: 100vh` / `width: 100vw` on `&` — a component shouldn't claim the
 *   viewport. Size the container through `className` instead.
 * - `caretColor` on `.cm-content` — `drawSelection()` hides the native caret and
 *   draws `.cm-cursor`, so that value never rendered.
 * - `color` repeated on `&` and `.cm-content` — it inherits.
 * - `lineHeight` repeated on `.cm-content` and `.cm-line` — likewise.
 * - `height: 100%` on `.cm-scroller` — only did anything because of the 100vh.
 * - the hardcoded font family — it now comes from the `font` option through a
 *   custom property, so the same appearance works in either family.
 * - autocomplete tooltip rules — nothing here enables `autocompletion()`, so
 *   they styled an element that never mounted. Restore them in whichever
 *   language spec turns completion on.
 */
export const TXFLOW_APPEARANCE = EditorView.theme({
  '&': {
    fontFamily: FONT_FAMILY,
    fontSize: '14px',
    backgroundColor: '#ffffff',
    color: '#000000',
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-content': {
    padding: '40px 48px',
    lineHeight: '1.35',
  },
  '.cm-line': { padding: '0' },
  '.cm-cursor': {
    borderLeftColor: '#000000',
    borderLeftWidth: '2px',
  },
  '.cm-selectionBackground': {
    backgroundColor: '#dbeafe !important',
  },
  '&.cm-focused .cm-selectionBackground': {
    backgroundColor: '#bfdbfe !important',
  },
  '.cm-placeholder': {
    color: '#94a3b8',
    fontStyle: 'italic',
  },
})
