import { existsSync, readdirSync, rmSync } from "node:fs"
import { homedir } from "node:os"
import { isAbsolute, join, relative, resolve } from "node:path"
import { isDir } from "./isDir"

/** Never descended into when looking for a nested repo. */
const UNSEARCHED = new Set(["node_modules", ".cache", "dist", "build", ".next"])

const MAX_DEPTH = 8

export interface RmResult {
  path: string
  removed: boolean
  reason?: string
}

/** True when `child` is `parent` itself or lives underneath it. */
function contains(parent: string, child: string): boolean {
  const rel = relative(parent, child)
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel))
}

/** The first `.git` at or below `dir`, or null. Bounded so a deep tree can't stall a delete. */
export function findGitDir(dir: string, depth = MAX_DEPTH): string | null {
  const git = join(dir, ".git")
  if (existsSync(git)) return git
  if (depth <= 0) return null

  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return null
  }

  for (const entry of entries) {
    if (!entry.isDirectory() || UNSEARCHED.has(entry.name)) continue
    const found = findGitDir(join(dir, entry.name), depth - 1)
    if (found) return found
  }

  return null
}

/**
 * Why `dir` must not be removed, or null when it's safe. Guards the filesystem
 * root, the home directory and anything above it, and any tree holding a git repo.
 */
export function rmDirReason(dir: string): string | null {
  const abs = resolve(dir)
  const home = homedir()

  if (abs === "/") return "refusing to remove the filesystem root"
  if (contains(abs, home)) return `refusing to remove "${abs}": it is at or above ${home}`

  const git = findGitDir(abs)
  if (git) return `refusing to remove "${abs}": it holds a git repo at ${git}`

  return null
}

/** Recursively removes a directory unless a guard says otherwise. Never throws. */
export function rmDir(dir: string): RmResult {
  if (!existsSync(dir)) return { path: dir, removed: false, reason: "does not exist" }
  if (!isDir(dir)) return { path: dir, removed: false, reason: "not a directory" }

  const reason = rmDirReason(dir)
  if (reason) return { path: dir, removed: false, reason }

  rmSync(dir, { recursive: true, force: true })
  return { path: dir, removed: true }
}
