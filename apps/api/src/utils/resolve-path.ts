// @paladin/api/src/utils/resolve-path.ts

import { homedir } from "os"
import { join } from "path"

const APP_PACKAGES = new Set(["web", "api"])

export function resolvePath(pathStr: string): string | null {
  if (!pathStr) return null
  if (pathStr.startsWith("/")) return pathStr

  if (pathStr.startsWith("@")) {
    const match = pathStr.match(/^@([\w-]+)\/([\w-]+)\/(.+)$/)
    if (!match) return null

    const [, org, pkg, rest] = match
    const base = APP_PACKAGES.has(pkg) ? "apps" : "packages"
    return join(homedir(), "projects", org, base, pkg, "src", rest)
  }

  return null
}

export function toAliasedPath(fullPath: string): string | null {
  const projectsDir = join(homedir(), "projects")
  if (!fullPath.startsWith(projectsDir)) return null

  const relative = fullPath.slice(projectsDir.length + 1)
  const parts = relative.split("/")
  if (parts.length < 4) return null

  const org = parts[0]
  const type = parts[1] // "apps" or "packages"
  const pkg = parts[2]
  const rest = parts.slice(4).join("/") // skip "src"

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
 * returns the directory containing package.json:
 * ie ~/projects/paladin/apps/web
 */
export function resolvePackageDir(aliasedPath: string): string | null {
  const match = aliasedPath.match(/^@([\w-]+)\/([\w-]+)\//)
  if (!match) return null

  const [, org, pkg] = match
  const base = APP_PACKAGES.has(pkg) ? "apps" : "packages"
  return join(homedir(), "projects", org, base, pkg)
}
