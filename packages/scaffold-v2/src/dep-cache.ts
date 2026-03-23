// @paladin/scaffold-v2/dep-cache.ts

import { existsSync } from "fs"
import { readFile, writeFile, mkdir } from "fs/promises"
import { join, dirname } from "path"
import { homedir } from "os"
import { bash } from "@paladin/utils/bash"

const CACHE_DIR = process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache")
const CACHE_PATH = join(CACHE_DIR, "paladin", "bun-dependency-cache.json")

export type DepCache = Record<string, string>

export async function loadDepCache(): Promise<DepCache> {
  if (!existsSync(CACHE_PATH)) return {}
  const raw = await readFile(CACHE_PATH, "utf-8")
  return JSON.parse(raw)
}

export async function saveDepCache(cache: DepCache): Promise<void> {
  await mkdir(dirname(CACHE_PATH), { recursive: true })
  await writeFile(CACHE_PATH, JSON.stringify(cache, null, 2))
}

/**
 * parse bun.lockb at the given root and build a name → version map.
 * bun has a built-in lockb parser via `bun bun.lockb`.
 * the output is a yarn.lock-like text format we can parse.
 */
export async function buildCacheFromLockfile(root: string): Promise<DepCache> {
  const lockPath = join(root, "bun.lockb")
  if (!existsSync(lockPath)) return {}

  const result = await bash(["bun", lockPath], { cwd: root })
  if (result.exitCode !== 0) return {}

  const cache: DepCache = {}
  const lines = result.stdout.split("\n")

  // bun lockb output format: "pkg@version" lines followed by resolution info
  // we parse lines like: `"package-name@version":` or `package-name@version:`
  for (const line of lines) {
    const m = line.match(/^"?(@?[^@\s"]+)@[^"]*"?.*version "([^"]+)"/)
      || line.match(/^"?(@?[^@\s"]+)@([^\s",:]+)/)
    if (m) {
      const [, name, version] = m
      if (name && version && !version.includes("workspace:")) {
        cache[name] = version
      }
    }
  }

  await saveDepCache(cache)
  return cache
}

/**
 * resolve a package name to name@version using the cache.
 * falls back to just the name if not in cache (bun add will get latest).
 */
export function resolveVersion(name: string, cache: DepCache): string {
  const version = cache[name]
  return version ? `${name}@${version}` : name
}
