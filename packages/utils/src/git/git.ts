import { existsSync } from "node:fs"
import { join } from "node:path"
import { bash, type BashResult } from "../bash/bash.ts"

export type GitStatusKind =
  | "added"
  | "modified"
  | "deleted"
  | "renamed"
  | "copied"
  | "typechange"
  | "untracked"
  | "unmerged"
  | "ignored"

export type GitStatusEntry = {
  /* path relative to the repo root (the new path for renames) */
  path: string
  /* previous path for renames / copies */
  origPath?: string
  kind: GitStatusKind
}

export type CompactDiff = {
  /* number of added lines */
  added: number
  /* number of removed lines */
  removed: number
  /* hunk headers and +/- lines only, capped at maxLines */
  lines: string[]
  /* true when lines were cut off by maxLines */
  truncated: boolean
}

function git(dir: string, args: string[]): Promise<BashResult> {
  return bash(["git", ...args], { cwd: dir })
}

async function gitOut(dir: string, args: string[]): Promise<string> {
  const result = await git(dir, args)
  if (result.exitCode !== 0) {
    throw new Error(`git ${args.join(" ")}: ${result.stderr.trim() || result.stdout.trim()}`)
  }
  return result.stdout
}

function toKind(x: string, y: string): GitStatusKind {
  if (x === "U" || y === "U" || (x === "A" && y === "A") || (x === "D" && y === "D")) return "unmerged"
  if (x === "R" || y === "R") return "renamed"
  if (x === "C" || y === "C") return "copied"
  if (x === "A") return "added"
  if (x === "D" || y === "D") return "deleted"
  if (x === "T" || y === "T") return "typechange"
  return "modified"
}

/* the path is the last field of a v2 record and may contain spaces, so skip the first `n` fields */
function pathAfter(record: string, n: number): string {
  return record.split(" ").slice(n).join(" ")
}

export function isGitRepo(dir: string): boolean {
  return existsSync(join(dir, ".git"))
}

/* absolute path of the repo containing `dir` (works from any subdirectory) */
export async function getRepoRoot(dir: string): Promise<string> {
  return (await gitOut(dir, ["rev-parse", "--show-toplevel"])).trim()
}

/* whether the repo has at least one commit */
export async function hasHead(dir: string): Promise<boolean> {
  return (await git(dir, ["rev-parse", "--verify", "-q", "HEAD"])).exitCode === 0
}

/* whether a repo-relative file or directory exists in HEAD, false when there is no HEAD */
export async function existsAtHead(dir: string, path: string): Promise<boolean> {
  return (await git(dir, ["cat-file", "-e", `HEAD:${path}`])).exitCode === 0
}

/* working tree status, untracked dirs expanded to files. paths are repo-root relative */
export async function getStatus(dir: string): Promise<GitStatusEntry[]> {
  // v2 records start with a type char, unlike v1's " M path", so bash()'s stdout trim can't damage the first one
  const out = await gitOut(dir, ["status", "--porcelain=v2", "-z", "--untracked-files=all"])
  const parts = out.split("\0")
  const entries: GitStatusEntry[] = []
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    if (!part) continue
    switch (part[0]) {
      case "1": // 1 XY sub mH mI mW hH hI path
        entries.push({ path: pathAfter(part, 8), kind: toKind(part[2], part[3]) })
        break
      case "2": // 2 XY sub mH mI mW hH hI Xscore path, then the original path
        entries.push({ path: pathAfter(part, 9), origPath: parts[++i], kind: toKind(part[2], part[3]) })
        break
      case "u": // u XY sub m1 m2 m3 mW h1 h2 h3 path
        entries.push({ path: pathAfter(part, 10), kind: "unmerged" })
        break
      case "?":
        entries.push({ path: part.slice(2), kind: "untracked" })
        break
      case "!":
        entries.push({ path: part.slice(2), kind: "ignored" })
        break
    }
  }
  return entries
}

/*
 * working tree vs HEAD for the given paths, with zero context and no file headers.
 * paths are relative to `dir`, so pass the repo root as `dir` when using getStatus paths
 */
export async function getCompactDiff(dir: string, paths: string[], maxLines = 40): Promise<CompactDiff> {
  const out = await gitOut(dir, [
    "diff", "HEAD", "-M", "--no-color", "--no-ext-diff", "--unified=0", "--", ...paths,
  ])
  const diff: CompactDiff = { added: 0, removed: 0, lines: [], truncated: false }
  let inHunk = false
  for (const line of out.split("\n")) {
    if (line.startsWith("diff --git ")) {
      inHunk = false
      continue
    }
    if (line.startsWith("Binary files ")) {
      diff.lines.push("(binary)")
      continue
    }
    if (line.startsWith("@@")) inHunk = true
    else if (!inHunk) continue
    else if (line[0] === "+") diff.added++
    else if (line[0] === "-") diff.removed++
    else continue

    if (diff.lines.length < maxLines) diff.lines.push(line)
    else diff.truncated = true
  }
  return diff
}

/* stage and commit only the given paths (other staged changes stay staged), returns the short sha */
export async function commitPaths(dir: string, message: string, paths: string[]): Promise<string> {
  if (!paths.length) throw new Error(`commitPaths: no paths for "${message}"`)
  await gitOut(dir, ["add", "-A", "--", ...paths])
  await gitOut(dir, ["commit", "--only", "-m", message, "--", ...paths])
  return (await gitOut(dir, ["rev-parse", "--short", "HEAD"])).trim()
}
