import { gitOut } from "./base.ts"

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
