// packages/api/src/fcache/utils/strip.ts

// Path comment: // or # or <!-- --> whose payload has a file extension
const PATH_COMMENT_RE =
  /^\s*(?:\/\/|#|<!--)\s*([^\s<>]+\.[a-z0-9]+)\s*(?:-->)?\s*$/i

export function stripHeader(raw: string): string {
  const lines = raw.split('\n')
  let i = 0

  if (i < lines.length && lines[i].startsWith('#!')) i++

  while (i < lines.length) {
    const line = lines[i]
    if (PATH_COMMENT_RE.test(line)) {
      i++
      break
    }
    if (line.trim() === '') {
      i++
      continue
    }
    break
  }

  while (i < lines.length && lines[i].trim() === '') i++
  return lines.slice(i).join('\n')
}

export function stripJsonComments(raw: string): string {
  const lines = raw.split('\n')
  let i = 0
  while (i < lines.length && lines[i].trim().startsWith('//')) i++
  return lines.slice(i).join('\n')
}
