import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

export type GrepMatch = {
  /* absolute path of the file containing the match */
  file: string
  /* 1-based line number */
  line: number
  /* full text of the matching line */
  text: string
}

export type GrepOpts = {
  /* files or dirs to search, nonexistent ones are skipped */
  paths: string[]
  /* file name globs to include, ie ['*.ts', '*.tsx'] */
  include?: string[]
  /* dir names to skip */
  excludeDirs?: string[]
  /* file name globs to skip, ie ['*.test.*'] */
  excludeFiles?: string[]
  /* case insensitive match */
  ignoreCase?: boolean
}

export const DEFAULT_EXCLUDE_DIRS = ['node_modules', 'dist', 'build', 'coverage', '.git']

/* recursive ripgrep search, pattern is rust regex syntax */
export async function grep(pattern: string, opts: GrepOpts): Promise<GrepMatch[]> {
  const paths = opts.paths.map(p => resolve(p)).filter(p => existsSync(p))
  if (!paths.length) return []

  const excludes = [...(opts.excludeDirs ?? DEFAULT_EXCLUDE_DIRS), ...(opts.excludeFiles ?? [])]
  // --no-config: ignore RIPGREP_CONFIG_PATH so user flags can't change output. piped output is already colorless + headingless
  // -H: keep the file name even when searching a single file
  const cmd = [
    'rg', '--no-config', '-n', '-H',
    ...(opts.ignoreCase ? ['-i'] : []),
    ...(opts.include ?? []).flatMap(g => ['--glob', g]),
    ...excludes.flatMap(g => ['--glob', `!${g}`]),
    '-e', pattern, '--', ...paths,
  ]

  const proc = Bun.spawn(cmd, { stdout: 'pipe', stderr: 'pipe' })
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])

  // 1 = no matches, 2 = error (may still have partial output, ie unreadable files)
  if (code > 1 && !out.trim()) throw new Error(`rg failed (${code}): ${err.trim()}`)

  return parseGrepOutput(out)
}

export function parseGrepOutput(out: string): GrepMatch[] {
  const matches: GrepMatch[] = []
  for (const raw of out.split('\n')) {
    const m = raw.match(/^(.+?):(\d+):(.*)$/)
    if (m) matches.push({ file: m[1], line: Number(m[2]), text: m[3] })
  }
  return matches
}
