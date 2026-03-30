// @paladin/conversation-processor/utils/path.ts

import { join, resolve } from "path"
import { homedir } from "os"

const DEFAULT_PROJECTS_DIR = join(homedir(), "projects")

/**
 * normalizes a directory path, expanding ~/ and ./ to absolute paths.
 */
function normalizeDirPath(dir: string): string {
  if (dir.startsWith("~/")) return join(homedir(), dir.slice(2))
  return resolve(dir)
}

/**
 * resolves a raw artifact path to an absolute path on disk.
 *
 * @param rawPath - the path header from an artifact, eg "@acme/fcache/src/utils.ts"
 * @param projectsDir - the root directory where all projects live, eg "~/projects".
 *   this is the parent of all workspace roots. "@acme/..." resolves under projectsDir/acme/...
 */
export function resolvePath(
  rawPath: string,
  projectsDir = DEFAULT_PROJECTS_DIR,
): string | null {
  // already absolute
  if (rawPath.startsWith("/")) return rawPath

  // relative paths not allowed
  if (rawPath.startsWith("./") || rawPath.startsWith("../")) {
    throw new Error(`relative paths not allowed: ${rawPath}`)
  }

  // expand ~/
  if (rawPath.startsWith("~/")) {
    return normalizeDirPath(rawPath)
  }

  const dir = normalizeDirPath(projectsDir)
  const withoutAt = rawPath.replace(/^@/, "")
  const parts = withoutAt.split("/")

  // @acme, @acme/ — no file specified
  if (parts.length < 2 || !parts[1]) return null

  // check last segment has a file extension
  if (!parts[parts.length - 1].includes(".")) return null

  const project = parts[0]

  if (parts.length === 2) {
    // @acme/readme.md → root file
    return join(dir, project, parts[1])
  }

  // @acme/fcache/src/utils.ts → projectsDir/acme/packages/fcache/src/utils.ts
  const packageName = parts[1]
  const rest = parts.slice(2).join("/")
  return join(dir, project, "packages", packageName, rest)
}

/**
 * extracts package info from an absolute file path within a workspace.
 *
 * @param absolutePath - full path to a file, eg "/home/user/projects/acme/packages/fcache/src/utils.ts"
 * @param workspaceRoot - the root of a specific project workspace, eg "/home/user/projects/acme".
 *   this is one level deeper than projectsDir — it's projectsDir + project name.
 *
 * returns null for root-level files that don't belong to a package.
 */
export function extractPackageInfo(
  absolutePath: string,
  workspaceRoot: string,
): { packageName: string; filePath: string } | null {
  const rel = absolutePath.slice(workspaceRoot.length + 1)

  if (!rel.startsWith("packages/")) return null

  // packages/fcache/src/utils.ts → packageName=fcache, filePath=src/utils.ts
  const parts = rel.split("/")
  const packageName = parts[1]
  const filePath = parts.slice(2).join("/")

  if (!packageName || !filePath) return null

  return { packageName, filePath }
}
