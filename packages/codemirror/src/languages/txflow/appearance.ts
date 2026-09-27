import { RangeSetBuilder, StateField, type EditorState } from '@codemirror/state'
import { Decoration, EditorView, type DecorationSet } from '@codemirror/view'

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
const TXFLOW_THEME = EditorView.theme({
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
  '.cm-rx-string': { color: '#16a34a' },
  '.cm-rx-comment': { color: '#9ca3af' },
})

/* Regex highlighting over the whole document, so backtick strings and block comments can span lines.
   One alternation, so the leftmost token wins and a quote inside a comment (or `//` inside a string) stays inert.
   A quote right after a letter is an apostrophe, and `//` right after a non-space is a url.
   Unterminated backticks and block comments match nothing. */
const TOKEN = new RegExp(
  [
    String.raw`(?<![^\s])\/\/.*`,
    String.raw`\/\*[\s\S]*?\*\/`,
    String.raw`(?<![\p{L}\p{N}])'.*?'`,
    String.raw`".*?"`,
    '`[^`]*`',
  ].join('|'),
  'gu',
)

const COMMENT = Decoration.mark({ class: 'cm-rx-comment' })
const STRING = Decoration.mark({ class: 'cm-rx-string' })

function tokenDecorations(state: EditorState): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  for (const match of state.doc.toString().matchAll(TOKEN)) {
    builder.add(match.index, match.index + match[0].length, match[0][0] === '/' ? COMMENT : STRING)
  }
  return builder.finish()
}

const tokenHighlight = StateField.define<DecorationSet>({
  create: tokenDecorations,
  update: (deco, tr) => (tr.docChanged ? tokenDecorations(tr.state) : deco),
  provide: (field) => EditorView.decorations.from(field),
})

export const TXFLOW_APPEARANCE = [TXFLOW_THEME, tokenHighlight]
