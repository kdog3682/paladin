import { EditorView } from '@codemirror/view'

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
 * - the hardcoded font family — the editor's `font` prop owns it, so this
 *   appearance works in any family.
 * - autocomplete tooltip rules — nothing here enables `autocompletion()`, so
 *   they styled an element that never mounted. Restore them in whichever
 *   language spec turns completion on.
 */
export const TXFLOW_APPEARANCE = EditorView.theme({
  '&': {
    backgroundColor: '#ffffff',
    color: '#000000',
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-content': {
    /* controls the margin around the editor */
    padding: '10px 10px', 
  },
  '.cm-line': { padding: '0' },
  '.cm-cursor': {
    borderLeftColor: '#000000',
    borderLeftWidth: '2px',
  },
  '.cm-selectionBackground': {
    /* the !important is needed for some reason*/
    backgroundColor: '#dbeafe !important',
  },
})
