// @paladin/conversation-processor/hydrate-imports.ts

import { existsSync } from "fs"
import { readFile, writeFile, mkdir } from "fs/promises"
import { dirname, join } from "path"
import type { IncomingFile, PkgContext } from "./types"
import { paladinPath } from "./utils/paladin-path"

const DEFAULT_CACHE_PATH = paladinPath("cache", "bun-dependency-cache.json")

type VersionMap = Record<string, string>

// ── Cache I/O ───────────────────────────────────────────────

async function loadCache(
  projectDir: string,
  cachePath = DEFAULT_CACHE_PATH,
): Promise<VersionMap> {
  if (existsSync(cachePath)) {
    const raw = await readFile(cachePath, "utf-8")
    return JSON.parse(raw)
  }
  return buildCacheFromLockfile(projectDir, cachePath)
}

async function saveCache(
  versions: VersionMap,
  cachePath = DEFAULT_CACHE_PATH,
): Promise<void> {
  await mkdir(dirname(cachePath), { recursive: true })
  await writeFile(cachePath, JSON.stringify(versions, null, 2))
}

async function buildCacheFromLockfile(
  projectDir: string,
  cachePath: string,
): Promise<VersionMap> {
  const lockPath = join(projectDir, "bun.lock")
  if (!existsSync(lockPath)) return {}

  const raw = await readFile(lockPath, "utf-8")
  const lock = Bun.JSONC.parse(raw)
  const packages: Record<string, unknown[]> = lock.packages ?? {}
  const versions: VersionMap = {}

  for (const key of Object.keys(packages)) {
    if (key.includes("workspace:")) continue
    const lastAt = key.lastIndexOf("@")
    if (lastAt <= 0) continue
    const name = key.slice(0, lastAt)
    const version = key.slice(lastAt + 1)
    if (name && version) versions[name] = version
  }

  if (Object.keys(versions).length) await saveCache(versions, cachePath)
  return versions
}

// ── NPM Fetch (cache miss) ─────────────────────────────────

async function fetchVersion(pkg: string): Promise<string | null> {
  const res = await fetch(`https://registry.npmjs.org/${pkg}/latest`)
  if (!res.ok) return null
  const { version } = await res.json()
  return version ?? null
}

// ── Hydrate Phase ───────────────────────────────────────────

export async function hydrateImports(
  packages: Map<string, PkgContext>,
  workspaceRoot: string,
  workspacePackages: Set<string>,
) {
  const versions = await loadCache(workspaceRoot)
  let cacheUpdated = false

  const pending: { imp: IncomingFile["imports"][number]; pkg: string }[] = []

  for (const [, pkg] of packages) {
    for (const file of pkg.incomingFiles) {
      for (const imp of file.imports) {
        if (imp.kind === "relative") continue

        if (imp.kind === "workspace" || workspacePackages.has(imp.specifier)) {
          imp.kind = "workspace"
          continue
        }

        if (versions[imp.specifier]) {
          imp.version = versions[imp.specifier]
          continue
        }

        pending.push({ imp, pkg: imp.specifier })
      }
    }
  }

  const uniquePkgs = [...new Set(pending.map(p => p.pkg))]

  const fetched = new Map<string, string | null>()
  await Promise.all(
    uniquePkgs.map(async (pkg) => {
      const version = await fetchVersion(pkg)
      fetched.set(pkg, version)
      if (version) {
        versions[pkg] = version
        cacheUpdated = true
      }
    }),
  )

  for (const { imp, pkg } of pending) {
    const version = fetched.get(pkg)
    if (version) imp.version = version
  }

  if (cacheUpdated) await saveCache(versions)
}
