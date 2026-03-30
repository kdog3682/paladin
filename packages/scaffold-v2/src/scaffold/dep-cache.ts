// @paladin/scaffold-v2/scaffold/dep-cache.ts

import { existsSync } from "fs"
import { readFile, writeFile, mkdir } from "fs/promises"
import { join, dirname } from "path"
import { homedir } from "os"

const CACHE_DIR = process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache")
export const DEFAULT_CACHE_PATH = join(CACHE_DIR, "paladin", "bun-dependency-cache.json")

export type DepCache = Record<string, string>

export async function loadDepCache(
  projectDir: string,
  cachePath = DEFAULT_CACHE_PATH,
): Promise<DepCache> {
  if (existsSync(cachePath)) {
    const raw = await readFile(cachePath, "utf-8")
    return JSON.parse(raw)
  }

  return buildCacheFromLockfile(projectDir, cachePath)
}

async function saveDepCache(cachePath: string, cache: DepCache): Promise<void> {
  await mkdir(dirname(cachePath), { recursive: true })
  await writeFile(cachePath, JSON.stringify(cache, null, 2))
}

async function buildCacheFromLockfile(projectDir: string, cachePath: string): Promise<DepCache> {
  const lockPath = join(projectDir, "bun.lock")
  if (!existsSync(lockPath)) return {}

  const raw = await readFile(lockPath, "utf-8")
  const lock = Bun.JSONC.parse(raw)
  const packages: Record<string, unknown[]> = lock.packages ?? {}
  const cache: DepCache = {}

  for (const key of Object.keys(packages)) {
    if (key.includes("workspace:")) continue

    const lastAt = key.lastIndexOf("@")
    if (lastAt <= 0) continue

    const name = key.slice(0, lastAt)
    const version = key.slice(lastAt + 1)
    if (name && version) cache[name] = version
  }

  if (Object.keys(cache).length) await saveDepCache(cachePath, cache)
  return cache
}

export function resolveVersion(name: string, cache: DepCache): string {
  const version = cache[name]
  return version ? `${name}@${version}` : name
}
