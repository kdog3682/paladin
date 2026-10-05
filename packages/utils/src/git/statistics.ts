import { git } from "./base.ts"

export type FrequencyEntry = {
  /* repo-root relative path ("." is never included for dirs) */
  path: string
  /* number of commits that touched this path (for dirs, a file directly inside it) */
  commits: number
  /* YYYY-MM-DD committer date of the most recent commit touching this path */
  lastChanged: string
}

export type ChangeFrequency = {
  /* files sorted by commit count, descending */
  files: FrequencyEntry[]
  /* directories sorted by commit count, descending */
  dirs: FrequencyEntry[]
  /* number of commits scanned */
  totalCommits: number
}

export type ChangeFrequencyOpts = {
  /* only consider commits after this date, any format git accepts ie "3 months ago", "2026-01-01" */
  since?: string
  /* only scan the most recent n commits */
  maxCommits?: number
  /* restrict history to these pathspecs (relative to dir) */
  paths?: string[]
  /* max entries returned per list, default 20 */
  limit?: number
  /* skip commits touching more files than this (bulk renames, formatting passes). default unlimited */
  maxFilesPerCommit?: number
  /* include merge commits, default false */
  includeMerges?: boolean
  /* drop paths matching any of these */
  exclude?: RegExp[]
}

const COMMIT_MARKER = "\u0001commit\u0001"

type Tally = { commits: number; lastChanged: string }

function bump(map: Map<string, Tally>, path: string, date: string) {
  const t = map.get(path)
  // log is newest-first, so the first date seen is the latest
  if (t) t.commits++
  else map.set(path, { commits: 1, lastChanged: date })
}

/* immediate parent dir, null for files at the repo root */
function parentDir(file: string): string | null {
  const i = file.lastIndexOf("/")
  return i === -1 ? null : file.slice(0, i)
}

function rank(map: Map<string, Tally>, limit: number): FrequencyEntry[] {
  return [...map]
    .map(([path, t]) => ({ path, ...t }))
    .sort((a, b) => b.commits - a.commits || b.lastChanged.localeCompare(a.lastChanged) || a.path.localeCompare(b.path))
    .slice(0, limit)
}

/* most frequently changed files and directories in the history of the repo containing `dir` */
export async function getChangeFrequency(dir: string, opts: ChangeFrequencyOpts = {}): Promise<ChangeFrequency> {
  const {
    since,
    maxCommits,
    paths = [],
    limit = 20,
    maxFilesPerCommit = Infinity,
    includeMerges = false,
    exclude = [],
  } = opts

  const args = [
    "-c", "core.quotepath=false", "log",
    "--name-only", "--no-color", "--relative=", // paths stay repo-root relative
    `--pretty=format:${COMMIT_MARKER}%cs`,
  ]
  if (!includeMerges) args.push("--no-merges")
  if (since) args.push(`--since=${since}`)
  if (maxCommits) args.push(`-n${maxCommits}`)
  args.push("--", ...paths)

  const result = await git(dir, args)
  if (result.exitCode !== 0) {
    // empty repo: no history to rank
    if (/does not have any commits/.test(result.stderr)) return { files: [], dirs: [], totalCommits: 0 }
    throw new Error(`git log: ${result.stderr.trim() || result.stdout.trim()}`)
  }

  const files = new Map<string, Tally>()
  const dirs = new Map<string, Tally>()
  let totalCommits = 0

  for (const chunk of result.stdout.split(COMMIT_MARKER)) {
    if (!chunk.trim()) continue
    const [date, ...rest] = chunk.split("\n")
    const touched = [...new Set(rest.map((l) => l.trim()).filter(Boolean))]
      .filter((p) => !exclude.some((re) => re.test(p)))
    totalCommits++
    if (!touched.length || touched.length > maxFilesPerCommit) continue

    const touchedDirs = new Set<string>()
    for (const file of touched) {
      bump(files, file, date)
      const d = parentDir(file)
      if (d) touchedDirs.add(d)
    }
    for (const d of touchedDirs) bump(dirs, d, date)
  }

  return { files: rank(files, limit), dirs: rank(dirs, limit), totalCommits }
}
