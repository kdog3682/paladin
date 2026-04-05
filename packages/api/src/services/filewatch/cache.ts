// @paladin/packages/api/src/services/filewatch/cache.ts

import { existsSync } from "fs"
import { readFile, writeFile, mkdir } from "fs/promises"
import { dirname, join } from "path"
import { config } from "../../config"

// ── Types ───────────────────────────────────────────────────

type VersionMap = Record<string, string>

// ── Internal ────────────────────────────────────────────────

let versions: VersionMap | null = null
let dirty = false

async function save(): Promise<void> {
  if (!dirty || !versions) return
  const cachePath = config.bunDepCacheDir
  await mkdir(dirname(cachePath), { recursive: true })
  await writeFile(cachePath, JSON.stringify(versions, null, 2))
  dirty = false
}

async function buildFromLockfile(projectDir: string): Promise<VersionMap> {
  const lockPath = join(projectDir, "bun.lock")
  if (!existsSync(lockPath)) return {}

  const raw = await readFile(lockPath, "utf-8")
  const lock = Bun.JSONC.parse(raw)
  const entries: Record<string, unknown[]> = lock.packages ?? {}
  const result: VersionMap = {}

  for (const key of Object.keys(entries)) {
    if (key.includes("workspace:")) continue
    const lastAt = key.lastIndexOf("@")
    if (lastAt <= 0) continue
    const name = key.slice(0, lastAt)
    const version = key.slice(lastAt + 1)
    if (name && version) result[name] = version
  }

  return result
}

async function fetchVersion(pkg: string): Promise<string | null> {
  const res = await fetch(`https://registry.npmjs.org/${pkg}/latest`)
  if (!res.ok) return null
  const { version } = await res.json()
  return version ?? null
}

// ── Public ──────────────────────────────────────────────────

export async function loadCache(projectDir: string): Promise<void> {
  const cachePath = config.bunDepCacheDir

  if (existsSync(cachePath)) {
    const raw = await readFile(cachePath, "utf-8")
    versions = JSON.parse(raw)
  } else {
    versions = await buildFromLockfile(projectDir)
    dirty = Object.keys(versions).length > 0
  }
}

export async function resolveVersion(pkg: string): Promise<string> {
  if (versions?.[pkg]) return `^${versions[pkg]}`

  const version = await fetchVersion(pkg)
  if (version) {
    versions![pkg] = version
    dirty = true
    return `^${version}`
  }

  return "latest"
}

export async function flushCache(): Promise<void> {
  await save()
  versions = null
  dirty = false
}
