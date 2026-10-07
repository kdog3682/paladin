import { codeFolding, foldGutter, foldService } from '@codemirror/language'
import { type EditorState, type Extension } from '@codemirror/state'
import { EditorView } from '@codemirror/view'

const HEADING_RE = /^(#{1,6}) /

/** the heading level of a line, 0 when it is not a heading */
export function headingLevel(text: string): number {
  return HEADING_RE.exec(text)?.[1]!.length ?? 0
}

/** the range a heading at `lineStart` folds: from the end of the heading line to the last
 * non-blank line before the next heading of the same or a higher level (or the doc end).
 * `##` swallows `###` sections but stops at the next `##` or `#`. null for an empty section */
export function headingFoldRange(state: EditorState, lineStart: number): { from: number, to: number } | null {
  const { doc } = state
  const start = doc.lineAt(lineStart)
  const level = headingLevel(start.text)
  if (!level) return null
  let last = start
  for (let n = start.number + 1; n <= doc.lines; n++) {
    const l = doc.line(n)
    const sub = headingLevel(l.text)
    if (sub && sub <= level) break
    // trailing blank lines stay visible, so the gap before the next section survives
    if (l.text.trim()) last = l
  }
  return last.number > start.number ? { from: start.to, to: last.to } : null
}

export type HeadingBlock = {
  /* the block's text, its heading line without the leading hashmarks */
  text: string
  /* how many lines the text spans */
  lines: number
}

/** the block the cursor is in: the nearest heading at or above `pos` (or the doc start when
 * there is none) through to the line before the next heading of the same or a higher level,
 * subheadings included. only the first line loses its `#` marks, and trailing blank lines are dropped */
export function headingBlockAt(state: EditorState, pos: number): HeadingBlock | null {
  const { doc } = state
  let start = doc.lineAt(pos).number
  while (start > 1 && !headingLevel(doc.line(start).text)) start--
  const level = headingLevel(doc.line(start).text)
  let end = start
  for (let n = start + 1; n <= doc.lines; n++) {
    const sub = headingLevel(doc.line(n).text)
    if (sub && (!level || sub <= level)) break
    if (doc.line(n).text.trim()) end = n
  }
  const lines = []
  for (let n = start; n <= end; n++) lines.push(doc.line(n).text)
  lines[0] = lines[0]!.replace(/^#{1,6} +/, '')
  const text = lines.join('\n')
  return text.trim() ? { text, lines: lines.length } : null
}

/* an svg chevron rather than the ▾ / ▸ glyphs, which sit at different heights and baselines */
const marker = (open: boolean) => {
  const el = document.createElement('span')
  el.className = 'cm-headingFoldMarker'
  el.innerHTML = `<svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="${open ? 'M1 2.5 4 5.5 7 2.5' : 'M2.5 1 5.5 4 2.5 7'}"/></svg>`
  return el
}

const headingFoldTheme = EditorView.theme({
  '.cm-gutters': { backgroundColor: 'transparent', border: 'none' },
  '.cm-foldGutter .cm-gutterElement': {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0',
    cursor: 'pointer',
  },
  '.cm-foldGutter': { marginRight: '-5px' },
  '.cm-headingFoldMarker': { display: 'flex', width: '12px', justifyContent: 'center', color: '#9ca3af' },
  '.cm-headingFoldMarker:hover': { color: '#000000' },
  // sublime-style yellow `…` badge after a folded heading
  '.cm-foldPlaceholder': {
    backgroundColor: '#fde68a',
    border: '1px solid #f59e0b',
    borderRadius: '4px',
    color: '#92400e',
    padding: '0 4px',
    margin: '0 4px',
  },
})

/** markdown-style `#` heading folds, with a fold arrow left of every heading and a yellow
 * badge where a folded section was */
export const headingFold = (): Extension => [
  foldService.of((state, lineStart) => headingFoldRange(state, lineStart)),
  // already in defaultExtensions; repeated so the extension stands alone
  codeFolding(),
  foldGutter({ markerDOM: marker }),
  headingFoldTheme,
]
