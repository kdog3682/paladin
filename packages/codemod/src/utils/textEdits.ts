/* one replacement in a text, in offsets of the original text */
export type TextEdit = {
  /* offset the replaced range starts at */
  start: number
  /* offset the replaced range ends at, equal to start for an insertion */
  end: number
  /* the text that takes its place */
  text: string
}

/*
 * Applies a set of edits to a text in one pass, so every edit's offsets refer to the original
 * text rather than to the text left by earlier edits. When the text is a slice of a larger one,
 * `offset` is where that slice starts. Throws on overlapping edits. Insertions at the same
 * offset keep the order they were given in.
 */
export function applyTextEdits(text: string, edits: TextEdit[], offset = 0): string {
  const sorted = edits
    .map((edit, index) => ({ ...edit, index }))
    .sort((a, b) => a.start - b.start || a.end - b.end || a.index - b.index)
  let out = ""
  let cursor = 0
  for (const edit of sorted) {
    const start = edit.start - offset
    if (start < cursor) throw new Error(`applyTextEdits: overlapping edits at offset ${edit.start}`)
    out += text.slice(cursor, start) + edit.text
    cursor = edit.end - offset
  }
  return out + text.slice(cursor)
}
