/* drop blank leading / trailing lines, strip the common indent, trim trailing whitespace per line */
export function smartDedent(text: string): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n").map((line) => line.replace(/\s+$/, ""))
  while (lines.length && !lines[0]) lines.shift()
  while (lines.length && !lines[lines.length - 1]) lines.pop()
  const indents = lines.filter(Boolean).map((line) => line.match(/^[ \t]*/)![0].length)
  const min = indents.length ? Math.min(...indents) : 0
  return lines.map((line) => line.slice(min)).join("\n")
}
