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

const marker = (open: boolean) => {
  const el = document.createElement('span')
  el.className = 'cm-headingFoldMarker'
  el.textContent = open ? '▾' : '▸'
  return el
}

const headingFoldTheme = EditorView.theme({
  '.cm-gutters': { backgroundColor: 'transparent', border: 'none' },
  '.cm-foldGutter .cm-gutterElement': { padding: '0 4px', cursor: 'pointer' },
  '.cm-headingFoldMarker': { color: '#9ca3af' },
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
