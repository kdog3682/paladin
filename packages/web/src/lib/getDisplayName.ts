// src/lib/getDisplayName.ts

interface DisplayNameOptions {
  length?: number
}

export function getDisplayName(
  path: string,
  options: DisplayNameOptions = {},
): string {
  const { length = 25 } = options

  // normalize: /home/<user> → ~/, ~/projects/ → @
  let normalized = path.replace(/^\/home\/\w+/, '~')
  normalized = normalized.replace(/^~\/projects\//, '@')

  if (normalized.length <= length) return normalized

  const parts = normalized.split('/')
  const prefix = parts[0]
  const basename = parts[parts.length - 1]

  // if even prefix/.../<basename> won't fit, just use basename
  const minimal = `${prefix}/.../${basename}`
  if (minimal.length > length) return basename.slice(0, length)

  // try adding parent segments from the end
  const middle = parts.slice(1, -1)
  for (let take = middle.length; take >= 1; take--) {
    const tail = middle.slice(middle.length - take)
    const attempt = `${prefix}/.../${tail.join('/')}/${basename}`
    if (attempt.length <= length) return attempt
  }

  return minimal
}
