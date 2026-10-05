import { gitOut } from "./base.ts"

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
