// src/lib/getDisplayName.ts

interface DisplayNameOptions {
  length?: number
}

export function getDisplayName(
  path: string,
  options: DisplayNameOptions = {},
): string {
  const { length = 40 } = options

  // normalize: /home/<user> → ~/, ~/projects/ → @
  let normalized = path.replace(/^\/home\/\w+/, '~')
  normalized = normalized.replace(/^~\/projects\//, '@')

  if (normalized.length <= length) return normalized

  const parts = normalized.split('/')
  const prefix = parts[0]  // "@paladin" or "~" etc
  const basename = parts[parts.length - 1]
  const parentDir = parts.length >= 2 ? parts[parts.length - 2] : null

  // try building up from basename, adding parent segments
  // always keep prefix + ... + tail
  const tail = parentDir && parentDir !== basename
    ? `${parentDir}/${basename}`
    : basename

  const candidate = `${prefix}/.../${tail}`

  if (candidate.length <= length) {
    // try to fit more middle segments
    const middle = parts.slice(1, -1)
    for (let take = middle.length; take >= 1; take--) {
      const kept = middle.slice(middle.length - take)
      const attempt = `${prefix}/.../${kept.join('/')}/${basename}`
      if (attempt.length <= length) return attempt
    }
    return candidate
  }

  // worst case: just prefix + basename
  const minimal = `${prefix}/.../${basename}`
  if (minimal.length <= length) return minimal

  // truly desperate: truncate basename
  return basename.slice(0, length)
}
