// @paladin/squire/src/shell/grid.ts
const DEFAULT_WIDTH = 80
const LETTERS = "abcdefghijklmnopqrstuvwxyz"
const COL_GAP = 2

function labelAt(i: number, numeric: boolean): string {
  if (numeric) return String(i + 1)
  return LETTERS[i]
}

export function formatGrid(names: string[], maxWidth = DEFAULT_WIDTH): string {
  const numeric = names.length > 26
  const maxLabelLen = numeric ? String(names.length).length : 1
  const prefixWidth = maxLabelLen + 2
  const maxName = Math.max(...names.map(n => n.length))
  const cellWidth = prefixWidth + maxName
  const cols = Math.max(1, Math.floor((maxWidth + COL_GAP) / (cellWidth + COL_GAP)))
  const rows = Math.ceil(names.length / cols)
  const lines: string[] = []

  for (let r = 0; r < rows; r++) {
    const parts: string[] = []
    for (let c = 0; c < cols; c++) {
      const i = r + c * rows
      if (i >= names.length) break
      const label = `${labelAt(i, numeric).padStart(maxLabelLen)}) ${names[i]}`
      parts.push(label.padEnd(cellWidth))
    }
    lines.push(parts.join("  "))
  }

  return lines.join("\n")
}
