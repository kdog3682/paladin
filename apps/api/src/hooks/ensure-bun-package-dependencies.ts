// @paladin/api/src/hooks/ensure-bun-package-dependencies.ts

import { readFile, writeFile } from "fs/promises"
import { join } from "path"
import { $ } from "bun"
import type { Artifact } from "@paladin/types"
import { resolvePackageDir } from "../utils/path-ops"
import { query } from "@paladin/ai"
import type { GitRepo } from "../vcs"

const CACHE_PATH = join(import.meta.dir, "../../dep-cache.json")

const TS_EXTENSIONS = new Set([".ts", ".tsx"])

interface DepEntry {
  name: string
  version: string
  type: "dependencies" | "devDependencies"
}

export interface DepsInstalledEvent {
  event: "depsInstalled"
  data: {
    packages: Record<string, string[]>
  }
}

async function loadCache(): Promise<Record<string, DepEntry>> {
  try {
    const raw = await readFile(CACHE_PATH, "utf-8")
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

async function saveCache(cache: Record<string, DepEntry>): Promise<void> {
  await writeFile(CACHE_PATH, JSON.stringify(cache, null, 2))
}

function extractImports(content: string): string[] {
  const imports: string[] = []
  // Handles: import X from 'x', import { X } from 'x', import 'x', import * as X from 'x'
  const regex = /import\s+(?:(?:[\w*{}\s,]+)\s+from\s+)?['"]([\w@][^'"]*)['"]/g
  let match: RegExpExecArray | null

  while ((match = regex.exec(content))) {
    const specifier = match[1]
    if (specifier.startsWith(".")) continue

    const pkgName = specifier.startsWith("@")
      ? specifier.split("/").slice(0, 2).join("/")
      : specifier.split("/")[0]

    imports.push(pkgName)
  }

  return [...new Set(imports)]
}

function isLocalPackage(importName: string, org: string): boolean {
  return importName.startsWith(`@${org}/`)
}

function isTsFile(path: string): boolean {
  for (const ext of TS_EXTENSIONS) {
    if (path.endsWith(ext)) return true
  }
  return false
}

/**
 * Ensures all npm dependencies are present in the relevant package.json files.
 * Groups artifacts by their package directory and processes once per package.
 * Called after all files have been written.
 */
export async function ensureBunPackageDependencies(
  artifacts: Artifact[],
  org: string
): Promise<DepsInstalledEvent | null> {
  const tsArtifacts = artifacts.filter((a) => a.path && a.aliasedPath && isTsFile(a.path))
  if (tsArtifacts.length === 0) return null

  // Group by package directory
  const byPkgDir = new Map<string, Artifact[]>()
  for (const a of tsArtifacts) {
    const pkgDir = resolvePackageDir(a.aliasedPath!)
    if (!pkgDir) continue
    const list = byPkgDir.get(pkgDir) ?? []
    list.push(a)
    byPkgDir.set(pkgDir, list)
  }

  if (byPkgDir.size === 0) return null

  const cache = await loadCache()
  let cacheUpdated = false
  const packagesResult: Record<string, string[]> = {}
  const dirsToInstall: string[] = []

  for (const [pkgDir, group] of byPkgDir) {
    const pkgJsonPath = join(pkgDir, "package.json")
    let pkgJson: Record<string, unknown>

    try {
      pkgJson = JSON.parse(await readFile(pkgJsonPath, "utf-8"))
    } catch {
      continue // scaffold should have created it
    }

    if (!pkgJson.dependencies) pkgJson.dependencies = {}
    if (!pkgJson.devDependencies) pkgJson.devDependencies = {}

    const deps = pkgJson.dependencies as Record<string, string>
    const devDeps = pkgJson.devDependencies as Record<string, string>
    const allExisting = new Set([...Object.keys(deps), ...Object.keys(devDeps)])

    // Collect all imports across the group
    const allImports = new Set<string>()
    for (const a of group) {
      for (const imp of extractImports(a.content)) {
        allImports.add(imp)
      }
    }

    const missing = [...allImports].filter((i) => !allExisting.has(i))
    if (missing.length === 0) continue

    const added: string[] = []

    for (const pkg of missing) {
      if (isLocalPackage(pkg, org)) {
        deps[pkg] = "workspace:*"
        added.push(pkg)
        continue
      }

      let entry = cache[pkg]

      if (!entry) {
        const result = await query(
          `What is the latest stable version and dependency type (dependencies or devDependencies) for npm package "${pkg}"? Respond only as JSON: { "name": "${pkg}", "version": "x.y.z", "type": "dependencies" | "devDependencies" }`,
          "haiku"
        )
        try {
          entry = JSON.parse(result) as DepEntry
          cache[pkg] = entry
          cacheUpdated = true
        } catch {
          continue
        }
      }

      const version = `^${entry.version}`
      const target = entry.type === "devDependencies" ? devDeps : deps
      target[entry.name] = version
      added.push(entry.name)
    }

    if (added.length > 0) {
      await writeFile(pkgJsonPath, JSON.stringify(pkgJson, null, 2) + "\n")
      packagesResult[pkgDir] = added
      dirsToInstall.push(pkgDir)
    }
  }

  if (cacheUpdated) {
    await saveCache(cache)
  }

  // Install once per package dir
  for (const dir of dirsToInstall) {
    await $`bun install`.cwd(dir).quiet()
  }

  if (Object.keys(packagesResult).length === 0) return null

  return {
    event: "depsInstalled",
    data: { packages: packagesResult },
  }
}
