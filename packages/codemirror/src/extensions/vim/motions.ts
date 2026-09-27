import type { Line, Text } from '@codemirror/state'

/** vim's three word classes: 0 whitespace, 1 word chars, 2 punctuation */
export type CharClass = 0 | 1 | 2

export const charClass = (ch: string | undefined): CharClass =>
  !ch || /\s/.test(ch) ? 0 : /\w/.test(ch) ? 1 : 2

const charAt = (doc: Text, pos: number) => doc.sliceString(pos, pos + 1)

/** normal-mode cursors sit on a character, so never past the last char of a non-empty line */
export const clampNormal = (doc: Text, pos: number) => {
  const line = doc.lineAt(Math.max(0, Math.min(pos, doc.length)))
  return line.length === 0 ? line.from : Math.max(line.from, Math.min(pos, line.to - 1))
}

export const indentOf = (text: string) => /^\s*/.exec(text)![0]

export const firstNonBlank = (line: Line) => line.from + indentOf(line.text).length

/** `w`: start of the next word, crossing lines */
export const nextWordStart = (doc: Text, pos: number) => {
  const len = doc.length
  let p = pos
  const cls = charClass(charAt(doc, p))
  if (cls !== 0) while (p < len && charClass(charAt(doc, p)) === cls) p++
  while (p < len && charClass(charAt(doc, p)) === 0) p++
  return p
}

/** `b`: start of the current word, or of the previous one when already at a start */
export const prevWordStart = (doc: Text, pos: number) => {
  let p = pos
  while (p > 0 && charClass(charAt(doc, p - 1)) === 0) p--
  if (p === 0) return 0
  const cls = charClass(charAt(doc, p - 1))
  while (p > 0 && charClass(charAt(doc, p - 1)) === cls) p--
  return p
}

/** `e`: last char of the current word, or of the next one when already at an end */
export const wordEnd = (doc: Text, pos: number) => {
  const len = doc.length
  let p = pos + 1
  while (p < len && charClass(charAt(doc, p)) === 0) p++
  if (p >= len) return Math.max(len - 1, 0)
  const cls = charClass(charAt(doc, p))
  while (p + 1 < len && charClass(charAt(doc, p + 1)) === cls) p++
  return p
}

/** `iw`: the run of same-class chars under pos, limited to its line */
export const wordRangeAt = (doc: Text, pos: number) => {
  const line = doc.lineAt(pos)
  const { text } = line
  const col = pos - line.from
  if (col >= text.length) return null
  const cls = charClass(text[col])
  let from = col
  let to = col + 1
  while (from > 0 && charClass(text[from - 1]) === cls) from--
  while (to < text.length && charClass(text[to]) === cls) to++
  return { from: line.from + from, to: line.from + to }
}
