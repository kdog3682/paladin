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

  const root = readJsonFile(pkgPath)
  const patterns = extractPatterns(root.workspaces)

  if (!patterns.length) {
    // fallback: scan packages/ directly
    return scanPackagesDir(workspaceRoot)
  }

  const dirs = await glob(patterns, { cwd: workspaceRoot })

  for (const dir of dirs) {
    const childPkgPath = join(workspaceRoot, dir, "package.json")
    if (!existsSync(childPkgPath)) continue

    let childPkg: Record<string, unknown>
    try {
      childPkg = readJsonFile(childPkgPath)
    } catch {
      // tolerate malformed child manifests so one package doesn't break processing
      continue
    }

    if (typeof childPkg.name === "string") names.add(childPkg.name)
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

    let pkg: Record<string, unknown>
    try {
      pkg = readJsonFile(pkgPath)
    } catch {
      continue
    }

    if (typeof pkg.name === "string") names.add(pkg.name)
  }

  return names
}

function readJsonFile(path: string): Record<string, unknown> {
  const raw = readFileSync(path, "utf-8").replace(/^\uFEFF/, "")

  try {
    return JSON.parse(raw)
  } catch {
    return JSON.parse(stripJsonComments(raw))
  }
}

function stripJsonComments(input: string): string {
  let output = ""
  let inString = false
  let escaped = false
  let inLineComment = false
  let inBlockComment = false

  for (let i = 0; i < input.length; i++) {
    const char = input[i]
    const next = input[i + 1]

    if (inLineComment) {
      if (char === "\n") {
        inLineComment = false
        output += char
      }
      continue
    }

    if (inBlockComment) {
      if (char === "*" && next === "/") {
        inBlockComment = false
        i++
      }
      continue
    }

    if (inString) {
      output += char
      if (escaped) {
        escaped = false
      } else if (char === "\\") {
        escaped = true
      } else if (char === "\"") {
        inString = false
      }
      continue
    }

    if (char === "\"") {
      inString = true
      output += char
      continue
    }

    if (char === "/" && next === "/") {
      inLineComment = true
      i++
      continue
    }

    if (char === "/" && next === "*") {
      inBlockComment = true
      i++
      continue
    }

    output += char
  }

  return output
}
