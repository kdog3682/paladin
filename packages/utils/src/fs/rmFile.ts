import { existsSync, rmSync } from "node:fs"
import { isDir } from "./isDir"
import type { RmResult } from "./rmDir"

/** Removes a single file. Directories are refused — use `rmDir` for those. */
export function rmFile(path: string): RmResult {
  if (!existsSync(path)) return { path, removed: false, reason: "does not exist" }
  if (isDir(path)) return { path, removed: false, reason: "is a directory" }

  rmSync(path, { force: true })
  return { path, removed: true }
}
