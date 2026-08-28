export function dedent(input: string) {
  const lines = input.split("\n")
  while (lines.length > 0 && lines[0]!.trim() === "") lines.shift()
  while (lines.length > 0 && lines[lines.length - 1]!.trim() === "") lines.pop()
  if (lines.length === 0) return ""

  let indent = Infinity
  for (const line of lines) {
    if (line.trim() === "") continue
    indent = Math.min(indent, line.length - line.trimStart().length)
  }
  if (!Number.isFinite(indent)) indent = 0

  return lines.map(line => line.slice(indent)).join("\n") + "\n"
}
