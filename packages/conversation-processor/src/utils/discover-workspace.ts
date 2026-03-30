// @paladin/conversation-processor/utils/discover-workspace.ts

import { readFileSync, existsSync, readdirSync } from "fs"
import { join } from "path"
import { glob } from "glob"

/**
 * discovers all workspace package names from the root package.json.
 * reads the "workspaces" field and resolves matching packages.
 *
 * supports both array format and object format:
 *   "workspaces": ["packages/*"]
 *   "workspaces": { "packages": ["packages/*"] }
 */
export async function discoverWorkspacePackages(
  workspaceRoot: string,
): Promise<Set<string>> {
  const names = new Set<string>()
  const pkgPath = join(workspaceRoot, "package.json")

  if (!existsSync(pkgPath)) return names

  const root = JSON.parse(readFileSync(pkgPath, "utf-8"))
  const patterns = extractPatterns(root.workspaces)

  if (!patterns.length) {
    // fallback: scan packages/ directly
    return scanPackagesDir(workspaceRoot)
  }

  const dirs = await glob(patterns, { cwd: workspaceRoot })

  for (const dir of dirs) {
    const childPkgPath = join(workspaceRoot, dir, "package.json")
    if (!existsSync(childPkgPath)) continue

    const childPkg = JSON.parse(readFileSync(childPkgPath, "utf-8"))
    if (childPkg.name) names.add(childPkg.name)
  }

  return names
}

function extractPatterns(workspaces: unknown): string[] {
  if (Array.isArray(workspaces)) return workspaces
  if (workspaces && typeof workspaces === "object" && "packages" in workspaces) {
    const pkgs = (workspaces as { packages: unknown }).packages
    if (Array.isArray(pkgs)) return pkgs
  }
  return []
}

function scanPackagesDir(workspaceRoot: string): Set<string> {
  const names = new Set<string>()
  const packagesDir = join(workspaceRoot, "packages")

  if (!existsSync(packagesDir)) return names

  for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const pkgPath = join(packagesDir, entry.name, "package.json")
    if (!existsSync(pkgPath)) continue

    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"))
    if (pkg.name) names.add(pkg.name)
  }

  return names
}
