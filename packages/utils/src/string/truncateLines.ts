export type TruncateLinesOptions = {
  /** total number of kept content lines (marker line is extra) */
  maxLines?: number
  marker?: (omitted: number) => string
}

/**
 * Keeps the head and tail of a multiline string, collapsing the middle.
 *
 *   a\nb\nc\nd\ne\nf\ng\nh\ni  ->  a\nb\nc\n<3 lines truncated>\ng\nh\ni
 */
export function truncateLines(text: string, options: TruncateLinesOptions = {}): string {
  const { maxLines = 6, marker = (omitted) => `<${omitted} lines truncated>` } = options
  if (maxLines <= 0) return text

  const lines = text.split("\n")
  if (lines.length <= maxLines) return text

  const head = Math.ceil(maxLines / 2)
  const tail = maxLines - head
  const omitted = lines.length - maxLines

  return [
    ...lines.slice(0, head),
    marker(omitted),
    ...(tail > 0 ? lines.slice(lines.length - tail) : []),
  ].join("\n")
}
