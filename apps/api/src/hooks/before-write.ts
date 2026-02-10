// @paladin/api/src/hooks/before-write.ts

import { readFile, writeFile } from "fs/promises"
import { join } from "path"
import type { Artifact } from "@paladin/types"
import { resolvePackageDir } from "../utils/path-ops"
import { query } from "@paladin/ai"

const CACHE_PATH = join(import.meta.dir, "../../dep-cache.json")

interface DepEntry {
  name: string
  version: string
  type: "dependencies" | "devDependencies"
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
  const regex = /import\s+(?:.*?\s+from\s+)?['"]([\w@][^'"]*)['"]/g
  let match: RegExpExecArray | null

  while ((match = regex.exec(content))) {
    const specifier = match[1]
    // Skip relative and local @paladin imports
    if (specifier.startsWith(".")) continue
    if (specifier.startsWith("@paladin/")) continue

    // Get bare package name (handle scoped packages)
    const pkgName = specifier.startsWith("@")
      ? specifier.split("/").slice(0, 2).join("/")
      : specifier.split("/")[0]

    imports.push(pkgName)
  }

  return [...new Set(imports)]
}

export async function ensurePackageDependencies(artifact: Artifact): Promise<void> {
  if (!artifact.aliasedPath) return

  const pkgDir = resolvePackageDir(artifact.aliasedPath)
  if (!pkgDir) return

  const pkgJsonPath = join(pkgDir, "package.json")
  let pkgJson: Record<string, unknown>

  try {
    pkgJson = JSON.parse(await readFile(pkgJsonPath, "utf-8"))
  } catch {
    return
  }

  const deps = (pkgJson.dependencies ?? {}) as Record<string, string>
  const devDeps = (pkgJson.devDependencies ?? {}) as Record<string, string>
  const allExisting = new Set([...Object.keys(deps), ...Object.keys(devDeps)])

  const imports = extractImports(artifact.content)
  const missing = imports.filter((i) => !allExisting.has(i))

  if (missing.length === 0) return

  const cache = await loadCache()
  let cacheUpdated = false

  for (const pkg of missing) {
    let entry = cache[pkg]

    if (!entry) {
      const result = await query(`What is the latest stable version and dependency type (dependencies or devDependencies) for npm package "${pkg}"? Respond as JSON: { "name": "${pkg}", "version": "x.y.z", "type": "dependencies" | "devDependencies" }`)
      try {
        entry = JSON.parse(result) as DepEntry
        cache[pkg] = entry
        cacheUpdated = true
      } catch {
        continue
      }
    }

    const target = entry.type === "devDependencies" ? "devDependencies" : "dependencies"
    if (!pkgJson[target]) pkgJson[target] = {}
    ;(pkgJson[target] as Record<string, string>)[entry.name] = `^${entry.version}`
  }

  await writeFile(pkgJsonPath, JSON.stringify(pkgJson, null, 2) + "\n")

  if (cacheUpdated) {
    await saveCache(cache)
  }
}
