// src/lib/getDisplayName.ts

interface DisplayNameOptions {
  length?: number
}

/**
 * Shortens a path for display.
 * ~/projects/<name>/... → @<name>/...
 * If it doesn't fit within length, progressively collapses middle segments.
 * Falls back to basename if nothing fits.
 */
export function getDisplayName(
  path: string,
  options: DisplayNameOptions = {},
): string {
  const { length = 25 } = options

  let normalized = path.replace(/^\/home\/\w+/, '~')
  normalized = normalized.replace(/^~\/projects\//, '@')

  if (normalized.length <= length) return normalized

  const parts = normalized.split('/')
  const prefix = parts[0]
  const basename = parts[parts.length - 1]

  const minimal = `${prefix}/.../${basename}`
  if (minimal.length > length) return basename.slice(0, length)

  const middle = parts.slice(1, -1)
  for (let take = middle.length; take >= 1; take--) {
    const tail = middle.slice(middle.length - take)
    const attempt = `${prefix}/.../${tail.join('/')}/${basename}`
    if (attempt.length <= length) return attempt
  }

  return minimal
}

/**
 * Alternate display: replaces ~/projects/<name> with @<name> but keeps the rest.
 * Non-project paths returned as-is.
 */
export function getEditorDisplayName(path: string): string {
  let result = path.replace(/^\/home\/\w+/, '~')
  result = result.replace(/^~\/projects\//, '@')
  return result
}

export function getBasename(path: string): string {
  const parts = path.split('/')
  return parts[parts.length - 1] || path
}

export function getDirectory(path: string): string {
  const parts = path.split('/')
  return parts.slice(0, -1).join('/')
}

/**
 * Derives a source label from a list of file paths.
 * For git source, finds the common project root.
 * ~/projects/paladin/packages/foobar/... → @git — paladin/foobar
 * Otherwise just @<source>
 */
export function getSourceLabel(source: string, paths: string[]): string {
  if (paths.length === 0) return `@${source}`

  const normalized = paths.map(p =>
    p.replace(/^\/home\/\w+\/projects\//, '')
  )

  // find common prefix segments
  const split = normalized.map(p => p.split('/'))
  const common: string[] = []
  for (let i = 0; i < (split[0]?.length ?? 0); i++) {
    const seg = split[0][i]
    if (split.every(s => s[i] === seg)) {
      common.push(seg)
    } else {
      break
    }
  }

  if (common.length === 0) return `@${source}`

  // collapse to first + last of common (e.g. paladin/packages/web → paladin/web)
  const projectName = common.length <= 2
    ? common.join('/')
    : `${common[0]}/${common[common.length - 1]}`

  if (source === 'git') {
    return `@git — ${projectName}`
  }

  return `@${projectName}`
}
