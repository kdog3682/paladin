import { existsSync, readFileSync, statSync } from "node:fs"
import { dirname, join, relative } from "node:path"
import { ask, type AskConfig } from "@paladin/ai"
import {
  commitPaths,
  getCompactDiff,
  getRepoRoot,
  getStatus,
  hasHead,
  type GitStatusEntry,
} from "@paladin/utils"

export type GitCommitOpts = {
  /* plan only, don't commit */
  dryRun?: boolean
  /* log the context sent to the model for each package, defaults to true */
  showContext?: boolean
  /* only print each package's context, never call the AI or commit */
  contextOnly?: boolean
  /* max diff lines shown to the model per file, defaults to 40 */
  maxDiffLines?: number
  /* passed through to ask (system is appended to the built-in one) */
  ai?: Omit<AskConfig, "jsonSchema">
  /* progress output, defaults to console.log */
  log?: (msg: string) => void
}

export type ChangedFile = GitStatusEntry & {
  /* undefined for deleted files */
  mtimeMs?: number
  added: number
  removed: number
  diff: string[]
  truncated: boolean
}

export type PackageChanges = {
  /* package.json name, or the dir when unnamed */
  name: string
  /* repo-relative package dir, "" for the repo root */
  dir: string
  files: ChangedFile[]
}

export type PlannedCommit = {
  message: string
  /* repo-relative paths */
  files: string[]
  /* set once committed */
  sha?: string
}

export type PackagePlan = {
  pkg: PackageChanges
  commits: PlannedCommit[]
}

const SCHEMA = "{commits: [{message, files}]}"

const SYSTEM = `You group the uncommitted changes of one package into logical git commits.
- Every file must be in exactly one commit. Use the file paths exactly as given.
- Use modification times as a strong hint: files edited within minutes of each other usually belong to the same change, big time gaps usually mean separate work. Confirm with the diffs.
- Prefer a few cohesive commits over one per file, but never mix unrelated work.
- Messages: conventional commits, imperative, lowercase, max 72 chars for the subject, e.g. "feat(scene): add axis labels". Add a short body after a blank line only when it helps.
- Order commits from oldest work to newest.`

/* group uncommitted changes under `target` by package, ask the AI to split each package into commits, then commit */
export async function gitCommit(target: string, opts: GitCommitOpts = {}): Promise<PackagePlan[]> {
  const log = opts.log ?? console.log
  // status paths are repo-root relative and pathspecs resolve against cwd, so everything runs from the root
  const root = await getRepoRoot(target)
  const scope = relative(root, target)

  const entries = (await getStatus(root)).filter(e => e.kind !== "ignored" && inScope(e.path, scope))
  const conflicts = entries.filter(e => e.kind === "unmerged")
  if (conflicts.length) throw new Error(`resolve conflicts first: ${conflicts.map(e => e.path).join(", ")}`)
  if (!entries.length) {
    log("nothing to commit")
    return []
  }

  const packages = await collectPackages(root, entries, opts.maxDiffLines ?? 40)

  if (opts.contextOnly) {
    for (const pkg of packages) {
      const context = renderContext(pkg)
      log(`\n===== context: ${pkg.name} (${pkg.files.length} files, ${context.length} chars) =====\n${context}`)
    }
    return packages.map(pkg => ({ pkg, commits: [] }))
  }
  // planning is independent per package, committing must be sequential (index lock)
  const plans = await Promise.all(packages.map(pkg => planPackage(pkg, opts.ai)))

  for (const plan of plans) {
    if (opts.showContext ?? true) log(`\n===== context: ${plan.pkg.name} =====\n${renderContext(plan.pkg)}`)
    log(formatPlan(plan))
    if (!opts.dryRun) await commitPlan(root, plan, log)
  }
  return plans
}

/* the per-package runner: ask the AI how to split this package's changes into commits */
export async function planPackage(pkg: PackageChanges, ai: GitCommitOpts["ai"] = {}): Promise<PackagePlan> {
  type Reply = { commits?: { message?: string; files?: string[] }[] }
  const reply = await ask<Reply>(renderContext(pkg), {
    temperature: 0.2,
    ...ai,
    system: [SYSTEM, ai.system].filter(Boolean).join("\n\n"),
    jsonSchema: SCHEMA,
  })
  return { pkg, commits: normalizeCommits(pkg, reply.commits ?? []) }
}

/* commit each planned group in order, filling in `sha` */
export async function commitPlan(root: string, plan: PackagePlan, log: (msg: string) => void = console.log) {
  const byPath = new Map(plan.pkg.files.map(f => [f.path, f]))
  for (const commit of plan.commits) {
    const paths = commit.files.flatMap(p => {
      const orig = byPath.get(p)?.origPath
      return orig ? [orig, p] : [p]
    })
    commit.sha = await commitPaths(root, commit.message, paths)
    log(`  ${commit.sha} ${firstLine(commit.message)}`)
  }
}

/* the prompt sent to the model for one package */
export function renderContext(pkg: PackageChanges): string {
  const head = [
    `package: ${pkg.name}${pkg.dir ? ` (${pkg.dir})` : ""}`,
    `now: ${stamp(Date.now())}`,
    `${pkg.files.length} changed files, oldest edit first. paths are relative to the package.`,
  ]
  const files = pkg.files.map(f => {
    const meta = [
      f.kind + (f.origPath ? ` from ${relTo(pkg.dir, f.origPath)}` : ""),
      `+${f.added} -${f.removed}`,
      f.mtimeMs === undefined ? "no mtime" : `${stamp(f.mtimeMs)} (${ago(f.mtimeMs)})`,
    ]
    const body = f.diff.length ? `\n${f.diff.join("\n")}${f.truncated ? "\n…" : ""}` : ""
    return `## ${relTo(pkg.dir, f.path)}  [${meta.join(", ")}]${body}`
  })
  return [...head, "", ...files].join("\n")
}

export function formatPlan(plan: PackagePlan): string {
  const lines = [`\n${plan.pkg.name} — ${plan.pkg.files.length} files, ${plan.commits.length} commits`]
  for (const c of plan.commits) {
    lines.push(`  • ${firstLine(c.message)}`)
    for (const f of c.files) lines.push(`      ${relTo(plan.pkg.dir, f)}`)
  }
  return lines.join("\n")
}

async function collectPackages(root: string, entries: GitStatusEntry[], maxLines: number): Promise<PackageChanges[]> {
  const head = await hasHead(root)
  const dirCache = new Map<string, string>()
  const groups = new Map<string, GitStatusEntry[]>()
  for (const entry of entries) {
    const dir = packageDir(root, entry.path, dirCache)
    groups.set(dir, [...(groups.get(dir) ?? []), entry])
  }

  const packages: PackageChanges[] = []
  for (const [dir, group] of groups) {
    const files = await Promise.all(group.map(e => describeFile(root, e, head, maxLines)))
    files.sort((a, b) => (a.mtimeMs ?? Infinity) - (b.mtimeMs ?? Infinity))
    packages.push({ name: packageName(root, dir), dir, files })
  }
  return packages
}

async function describeFile(root: string, entry: GitStatusEntry, head: boolean, maxLines: number): Promise<ChangedFile> {
  const abs = join(root, entry.path)
  const mtimeMs = existsSync(abs) ? statSync(abs).mtimeMs : undefined
  if (entry.kind === "untracked" || !head) return { ...entry, mtimeMs, ...previewNewFile(abs, maxLines) }

  const paths = entry.origPath ? [entry.origPath, entry.path] : [entry.path]
  // a deleted file's full body is noise, the counts are enough
  const diff = await getCompactDiff(root, paths, entry.kind === "deleted" ? 0 : maxLines)
  return { ...entry, mtimeMs, added: diff.added, removed: diff.removed, diff: diff.lines, truncated: diff.truncated }
}

function previewNewFile(abs: string, maxLines: number) {
  if (!existsSync(abs)) return { added: 0, removed: 0, diff: [], truncated: false }
  const text = readFileSync(abs, "utf8")
  if (text.includes("\0")) return { added: 0, removed: 0, diff: ["(binary)"], truncated: false }
  const lines = text.split("\n")
  return {
    added: lines.length,
    removed: 0,
    diff: lines.slice(0, maxLines).map(l => `+${l}`),
    truncated: lines.length > maxLines,
  }
}

/* keep only known files, each in one commit; anything the model dropped goes into a catch-all */
function normalizeCommits(pkg: PackageChanges, raw: { message?: string; files?: string[] }[]): PlannedCommit[] {
  const lookup = new Map<string, string>()
  for (const f of pkg.files) {
    lookup.set(f.path, f.path)
    lookup.set(relTo(pkg.dir, f.path), f.path)
  }

  const used = new Set<string>()
  const commits: PlannedCommit[] = []
  for (const c of raw) {
    const message = c.message?.trim()
    if (!message) continue
    const files: string[] = []
    for (const p of c.files ?? []) {
      const path = lookup.get(p.trim().replace(/^\.\//, ""))
      if (path && !used.has(path)) {
        used.add(path)
        files.push(path)
      }
    }
    if (files.length) commits.push({ message, files })
  }

  const rest = pkg.files.map(f => f.path).filter(p => !used.has(p))
  if (rest.length) {
    const scope = pkg.name.split("/").pop()
    commits.push({ message: `chore(${scope}): update ${rest.length} file${rest.length > 1 ? "s" : ""}`, files: rest })
  }
  return commits
}

/* nearest ancestor dir (repo-relative) holding a package.json, "" for the repo root */
function packageDir(root: string, path: string, cache: Map<string, string>): string {
  const start = dirname(path)
  const visited: string[] = []
  let dir = start
  let found = ""
  while (dir !== "." && dir !== "") {
    const hit = cache.get(dir)
    if (hit !== undefined) {
      found = hit
      break
    }
    visited.push(dir)
    if (existsSync(join(root, dir, "package.json"))) {
      found = dir
      break
    }
    dir = dirname(dir)
  }
  for (const d of visited) cache.set(d, found)
  return found
}

function packageName(root: string, dir: string): string {
  const file = join(root, dir, "package.json")
  try {
    const name = JSON.parse(readFileSync(file, "utf8")).name
    if (typeof name === "string" && name) return name
  } catch {}
  return dir || "(root)"
}

function inScope(path: string, scope: string): boolean {
  return !scope || path === scope || path.startsWith(scope + "/")
}

function relTo(dir: string, path: string): string {
  return dir && path.startsWith(dir + "/") ? path.slice(dir.length + 1) : path
}

function firstLine(s: string): string {
  return s.split("\n")[0]
}

function stamp(ms: number): string {
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function ago(ms: number): string {
  const s = Math.max(0, (Date.now() - ms) / 1000)
  if (s < 60) return "just now"
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 172800) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}
