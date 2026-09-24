import { type Line, type SelectionRange, type Text } from '@codemirror/state'

export type LinePrefix = {
  /* leading whitespace of the line */
  indent: string
  /* continuation marker after the indent (`// `, `* `, `- `), empty when there is none */
  marker: string
  /* everything after indent + marker */
  rest: string
}

const MARKER_RE = /^(\/\/+ ?|\*(?: |$)|-(?: |$))/

export function leadingWhitespace(text: string): string {
  return /^[ \t]*/.exec(text)![0]
}

export function parseLinePrefix(text: string): LinePrefix {
  const indent = leadingWhitespace(text)
  const body = text.slice(indent.length)
  const marker = MARKER_RE.exec(body)?.[0] ?? ''
  return { indent, marker, rest: body.slice(marker.length) }
}

/** the marker as it should appear on the next line. `//` is kept verbatim so a
 * no-space style (`//foo`) is preserved; `*` and `-` always carry a space */
export function repeatMarker(marker: string): string {
  if (!marker || marker.startsWith('/')) return marker
  return marker.endsWith(' ') ? marker : marker + ' '
}

/** lines touched by a range. a non-empty range ending at column 0 does not
 * include that last line */
export function selectedLines(doc: Text, range: SelectionRange): Line[] {
  const start = doc.lineAt(range.from)
  let end = doc.lineAt(range.to)
  if (!range.empty && end.number > start.number && range.to === end.from) end = doc.line(end.number - 1)
  const out: Line[] = []
  for (let n = start.number; n <= end.number; n++) out.push(doc.line(n))
  return out
}

/** shortest leading whitespace among the non-blank lines */
export function minIndent(lines: Line[]): string {
  let best: string | null = null
  for (const line of lines) {
    if (!line.text.trim()) continue
    const ws = leadingWhitespace(line.text)
    if (best === null || ws.length < best.length) best = ws
  }
  return best ?? ''
}

/** indent a line "lives at": its own whitespace, or for an empty line the
 * indent of the nearest non-blank line above */
export function contextIndent(doc: Text, line: Line): string {
  if (line.text.length) return leadingWhitespace(line.text)
  for (let n = line.number - 1; n >= 1; n--) {
    const text = doc.line(n).text
    if (text.trim()) return leadingWhitespace(text)
  }
  return ''
}
