// src/services/bootstrap/npmCache.ts

import { existsSync } from "fs"
import { readFile, writeFile, mkdir } from "fs/promises"
import { dirname, join } from "path"
import { config } from "../../config"

// ── Types ───────────────────────────────────────────────────

type VersionMap = Record<string, string>

// ── State ───────────────────────────────────────────────────

let versions: VersionMap | null = null
let dirty = false

// ── Internal ────────────────────────────────────────────────

async function buildFromLockfile(rootDir: string): Promise<VersionMap> {
  const lockPath = join(rootDir, "bun.lock")
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

export async function loadNpmCache(rootDir: string): Promise<void> {
  if (versions) return

  const cachePath = config.npmCachePath

  if (existsSync(cachePath)) {
    const raw = await readFile(cachePath, "utf-8")
    versions = JSON.parse(raw)
  } else {
    versions = await buildFromLockfile(rootDir)
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

export async function flushNpmCache(): Promise<void> {
  if (!dirty || !versions) return

  const cachePath = config.npmCachePath
  await mkdir(dirname(cachePath), { recursive: true })
  await writeFile(cachePath, JSON.stringify(versions, null, 2))
  dirty = false
}
