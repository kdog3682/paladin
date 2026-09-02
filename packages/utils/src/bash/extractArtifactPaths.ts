/** a basename must have at least one char before a dot, then an alpha-led ext */
const EXT_RE = /[^.\s/\\]\.[A-Za-z][A-Za-z0-9]{0,9}$/
/** chars that never show up in a path we'd want to surface */
const ILLEGAL_RE = /["'`<>|*?]/
/** trailing prose punctuation console.log tends to leave behind */
const TRAILING_PUNCT_RE = /[),.;:]+$/
/** a path quoted at the end of the line, so spaces inside are preserved */
const TRAILING_QUOTED_RE = /(['"`])([^'"`]+)\1\s*$/
const MAX_PATH_LEN = 4096

export type ArtifactPaths = {
  /** everything above the trailing run of paths, trimmed */
  text: string
  paths: string[]
}

function unquote(s: string): string {
  return s.replace(/^['"`]+/, '').replace(/['"`]+$/, '')
}

/** a token is an artifact path only if it has a separator and a real extension */
export function isArtifactPath(token: string): boolean {
  if (!token || token.length > MAX_PATH_LEN) return false
  if (/[\n\r\t]/.test(token)) return false
  if (!/[/\\]/.test(token)) return false
  if (token.includes('://')) return false
  if (ILLEGAL_RE.test(token)) return false
  const base = token.slice(Math.max(token.lastIndexOf('/'), token.lastIndexOf('\\')) + 1)
  return EXT_RE.test(base)
}

/**
 * Pull the path out of a `console.log(field, path)` or `console.log(path)` line.
 * Returns undefined when the line has no path with an extension.
 */
export function extractPathFromLine(line: string): string | undefined {
  const trimmed = line.trim()
  if (!trimmed) return undefined
  const quoted = TRAILING_QUOTED_RE.exec(trimmed)
  if (quoted && isArtifactPath(quoted[2] ?? '')) return quoted[2]
  const tokens = trimmed.split(/\s+/)
  const last = unquote(tokens[tokens.length - 1] ?? '').replace(TRAILING_PUNCT_RE, '')
  return isArtifactPath(last) ? last : undefined
}

/**
 * Walk stdout from the bottom up, collecting paths until a line isn't one.
 * Whatever sits above that point is returned as `text`, so a program can log
 * prose and still have its trailing file list lifted out. Blank lines are
 * transparent. Returns null when the last non-blank line isn't a path.
 *
 *   building...        <- text
 *                      <- blank, transparent
 *   src/a.ts           <- path
 *   wrote src/b.ts     <- path with a label
 */
export function extractArtifactPaths(stdout: string): ArtifactPaths | null {
  const lines = stdout.split(/\r?\n/)
  const paths: string[] = []
  const seen = new Set<string>()
  let start = lines.length
  for (let i = lines.length - 1; i >= 0; i--) {
    const trimmed = lines[i]?.trim() ?? ''
    if (!trimmed) continue
    const path = extractPathFromLine(trimmed)
    if (!path) break
    start = i
    if (seen.has(path)) continue
    seen.add(path)
    paths.unshift(path)
  }
  if (paths.length === 0) return null
  return { text: lines.slice(0, start).join('\n').trim(), paths }
}
