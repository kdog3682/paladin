// Blank-line placement is not significant: a codemod's exact number of blank lines around
// an edit (or the fixture's) is incidental, not part of what's being tested.
export function normalize(code: string) {
  return code
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(line => line.replace(/[ \t]+$/, ''))
    .filter(line => line !== '')
    .join('\n')
    .trim()
}

/** LCS line diff, trimmed to two lines of context around each hunk. */
export function diff(received: string, expected: string) {
  const a = received.length === 0 ? [] : received.split('\n')
  const b = expected.length === 0 ? [] : expected.split('\n')

  const lcs = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
    }
  }

  const rows: { tag: string; text: string }[] = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      rows.push({ tag: ' ', text: a[i++] })
      j++
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      rows.push({ tag: '-', text: a[i++] })
    } else {
      rows.push({ tag: '+', text: b[j++] })
    }
  }
  while (i < a.length) rows.push({ tag: '-', text: a[i++] })
  while (j < b.length) rows.push({ tag: '+', text: b[j++] })

  const keep = new Set<number>()
  rows.forEach((row, index) => {
    if (row.tag === ' ') return
    for (let k = index - 2; k <= index + 2; k++) keep.add(k)
  })

  const lines: string[] = []
  let elided = false
  rows.forEach((row, index) => {
    if (!keep.has(index)) {
      if (!elided) lines.push('...')
      elided = true
      return
    }
    elided = false
    lines.push(`${row.tag} ${row.text}`)
  })

  return lines
}
