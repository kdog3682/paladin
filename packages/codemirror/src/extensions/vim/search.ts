export type FindOpts = {
  /* only match when not surrounded by word chars */
  wholeWord?: boolean
  /* defaults to smartcase: case sensitive only when the query has an uppercase letter */
  caseSensitive?: boolean
}

const isWordChar = (ch: string | undefined) => !!ch && /\w/.test(ch)

/** the next match strictly after (dir 1) or before (dir -1) pos, wrapping around the text */
export const findMatch = (
  text: string,
  query: string,
  pos: number,
  dir: 1 | -1,
  opts: FindOpts = {},
): number | null => {
  if (!query) return null
  const cs = opts.caseSensitive ?? /[A-Z]/.test(query)
  const hay = cs ? text : text.toLowerCase()
  const needle = cs ? query : query.toLowerCase()
  const isHit = (i: number) =>
    !opts.wholeWord || (!isWordChar(text[i - 1]) && !isWordChar(text[i + query.length]))
  // lastIndexOf clamps negative indexes to 0, so step down explicitly
  const before = (i: number) => (i > 0 ? hay.lastIndexOf(needle, i - 1) : -1)

  if (dir === 1) {
    for (let i = hay.indexOf(needle, pos + 1); i !== -1; i = hay.indexOf(needle, i + 1)) if (isHit(i)) return i
    for (let i = hay.indexOf(needle); i !== -1 && i <= pos; i = hay.indexOf(needle, i + 1)) if (isHit(i)) return i
  } else {
    for (let i = before(pos); i !== -1; i = before(i)) if (isHit(i)) return i
    for (let i = hay.lastIndexOf(needle); i !== -1 && i >= pos; i = before(i)) if (isHit(i)) return i
  }
  return null
}

/** the keyword under or after col, used by * and # */
export const keywordAt = (line: string, col: number) => {
  for (const m of line.matchAll(/\w+/g)) {
    if (m.index! + m[0].length > col) return { from: m.index!, word: m[0] }
  }
  return null
}
