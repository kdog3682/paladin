// @paladin/conversation-processor/utils/path.ts

import { basename, extname, join, resolve } from "path"
import { homedir } from "os"

const DEFAULT_PROJECTS_DIR = join(homedir(), "projects")

/**
 * normalizes a directory path, expanding ~/ and ./ to absolute paths.
 */
function normalizeDirPath(dir: string): string {
  if (dir.startsWith("~/")) return join(homedir(), dir.slice(2))
  return resolve(dir)
}

function hasExtension(segment: string): boolean {
  return extname(segment) !== ""
}

function isPackageRootConfig(pathInPkg: string): boolean {
  const name = basename(pathInPkg)
  return /\.config\.[^.]+$/.test(name) || /^tsconfig(?:\..+)?\.json$/.test(name)
}

function resolveWorkspacePath(workspaceRoot: string, relPath: string): string | null {
  const rel = relPath.trim()
  if (!rel) return null

  const parts = rel.split("/").filter(Boolean)
  if (!parts.length) return null

  if (parts[0] === "docs") {
    return join(workspaceRoot, rel)
  }

  if (parts[0] === "packages") {
    const pkg = parts[1]
    const rest = parts.slice(2).join("/")
    if (!pkg) return null
    if (!rest) return null
    if (rest.startsWith("src/") || isPackageRootConfig(rest)) {
      return join(workspaceRoot, "packages", pkg, rest)
    }
    return join(workspaceRoot, "packages", pkg, "src", rest)
  }

  if (hasExtension(parts[0])) {
    return join(workspaceRoot, rel)
  }

  const pkg = parts[0]
  const rest = parts.slice(1).join("/")
  if (!rest) return null
  if (rest.startsWith("src/") || isPackageRootConfig(rest)) {
    return join(workspaceRoot, "packages", pkg, rest)
  }
  return join(workspaceRoot, "packages", pkg, "src", rest)
}

function splitProjectPath(rawPath: string): { project: string; relPath: string } | null {
  const normalized = rawPath.trim()
  if (!normalized) return null

  if (normalized.startsWith("@")) {
    const slash = normalized.indexOf("/", 1)
    if (slash === -1) return null
    const project = normalized.slice(1, slash).trim()
    const relPath = normalized.slice(slash + 1).trim()
    if (!project || !relPath) return null
    return { project, relPath }
  }

  const parts = normalized.split("/").filter(Boolean)
  if (parts.length < 2) return null

  const project = parts[0]
  const relPath = parts.slice(1).join("/")
  if (!project || !relPath) return null
  return { project, relPath }
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
  const normalized = rawPath.trim()
  if (!normalized) return null

  // already absolute
  if (normalized.startsWith("/")) return normalized

  // relative paths not allowed
  if (normalized.startsWith("./") || normalized.startsWith("../")) {
    throw new Error(`relative paths not allowed: ${normalized}`)
  }

  // expand ~/
  if (normalized.startsWith("~/")) {
    return normalizeDirPath(normalized)
  }

  const dir = normalizeDirPath(projectsDir)
  const parsed = splitProjectPath(normalized)
  if (!parsed) return null

  const workspaceRoot = join(dir, parsed.project)
  return resolveWorkspacePath(workspaceRoot, parsed.relPath)
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
