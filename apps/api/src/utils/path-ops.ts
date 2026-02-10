// @paladin/api/src/utils/path-ops.ts

import { homedir } from "os"
import { join } from "path"

const APP_PACKAGES = new Set(["web", "api"])
const ROOT_PACKAGES = new Set(["scripts", "docs"])

/**
 * Extracts path from first comment line of file content.
 */
export function parsePathFromComment(content: string): string | null {
  const lines = content.split("\n")

  for (let i = 0; i < Math.min(2, lines.length); i++) {
    const line = lines[i]
    const match = line.match(/^\s*(?:\/\/|#|--|\/\*)\s*([@\/][\w\-\/\.]+)/)
    if (match) return match[1]
  }

  return null
}

/**
 * Strips a redundant /src/ segment if present in the aliased path.
 */
function normalizeAliased(pathStr: string): string {
  return pathStr.replace(/^(@[\w-]+\/[\w-]+)\/src\//, "$1/")
}

/**
 * Resolves an aliased path like @paladin/web/components/Button.tsx
 * to an absolute filesystem path.
 *
 * @org/web/...  → ~/projects/org/apps/web/src/...
 * @org/api/...  → ~/projects/org/apps/api/src/...
 * @org/ui/...   → ~/projects/org/packages/ui/src/...
 * @org/scripts/... → ~/projects/org/scripts/...
 * @org/docs/...    → ~/projects/org/docs/...
 */
export function resolvePath(pathStr: string): string | null {
  if (!pathStr) return null
  if (pathStr.startsWith("/")) return pathStr

  if (pathStr.startsWith("@")) {
    const normalized = normalizeAliased(pathStr)
    const match = normalized.match(/^@([\w-]+)\/([\w-]+)\/(.+)$/)
    if (!match) return null

    const [, org, pkg, rest] = match

    if (ROOT_PACKAGES.has(pkg)) {
      return join(homedir(), "projects", org, pkg, rest)
    }

    const base = APP_PACKAGES.has(pkg) ? "apps" : "packages"
    return join(homedir(), "projects", org, base, pkg, "src", rest)
  }

  return null
}

/**
 * Converts an absolute filesystem path back to an aliased path.
 */
export function toAliasedPath(fullPath: string): string | null {
  const projectsDir = join(homedir(), "projects")
  if (!fullPath.startsWith(projectsDir)) return null

  const relative = fullPath.slice(projectsDir.length + 1)
  const parts = relative.split("/")
  if (parts.length < 3) return null

  const org = parts[0]
  const type = parts[1]

  if (ROOT_PACKAGES.has(type)) {
    const rest = parts.slice(2).join("/")
    return `@${org}/${type}/${rest}`
  }

  if (parts.length < 4) return null
  const pkg = parts[2]
  const rest = parts.slice(4).join("/")

  if (type === "apps" && APP_PACKAGES.has(pkg)) {
    return `@${org}/${pkg}/${rest}`
  }

  if (type === "packages") {
    return `@${org}/${pkg}/${rest}`
  }

  return null
}

/**
 * Given an aliased path like @paladin/web/foo.tsx,
 * returns the directory containing package.json.
 */
export function resolvePackageDir(aliasedPath: string): string | null {
  const normalized = normalizeAliased(aliasedPath)
  const match = normalized.match(/^@([\w-]+)\/([\w-]+)\//)
  if (!match) return null

  const [, org, pkg] = match

  if (ROOT_PACKAGES.has(pkg)) return null

  const base = APP_PACKAGES.has(pkg) ? "apps" : "packages"
  return join(homedir(), "projects", org, base, pkg)
}

/**
 * Given an aliased path, returns the project root dir.
 */
export function resolveProjectDir(aliasedPath: string): string | null {
  const match = aliasedPath.match(/^@([\w-]+)\//)
  if (!match) return null
  return join(homedir(), "projects", match[1])
}

/**
 * Extracts the org name from an aliased path.
 */
export function extractOrg(aliasedPath: string): string | null {
  const match = aliasedPath.match(/^@([\w-]+)\//)
  return match ? match[1] : null
}
