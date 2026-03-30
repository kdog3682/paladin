// @paladin/docgen/discover.ts

import { existsSync, readdirSync } from "fs"
import { join, resolve } from "path"

const ENTRYPOINT_BASES = ["index", "main", "cli", "server"]
const EXTENSIONS = [".ts", ".tsx"]

const ENTRYPOINT_NAMES = ENTRYPOINT_BASES.flatMap(base =>
  EXTENSIONS.map(ext => `${base}${ext}`)
)

function findEntrypoints(dir: string): string[] {
  const found: string[] = []
  for (const name of ENTRYPOINT_NAMES) {
    const candidate = join(dir, name)
    if (existsSync(candidate)) found.push(candidate)
  }
  return found
}

/**
 * Discover entrypoint files under rootDir.
 * Checks rootDir, rootDir/src/, then immediate subdirs (and their src/).
 * Deduplicates by resolved absolute path.
 */
export function discoverEntrypoints(rootDir: string): string[] {
  const abs = resolve(rootDir)
  const seen = new Set<string>()
  const entrypoints: string[] = []

  const add = (paths: string[]) => {
    for (const p of paths) {
      const resolved = resolve(p)
      if (!seen.has(resolved)) {
        seen.add(resolved)
        entrypoints.push(resolved)
      }
    }
  }

  // 1) check rootDir directly
  add(findEntrypoints(abs))

  // 2) check rootDir/src/
  add(findEntrypoints(join(abs, "src")))

  // if we found anything at root level, return early
  if (entrypoints.length > 0) return entrypoints

  // 3) scan immediate subdirs
  const entries = readdirSync(abs, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const subDir = join(abs, entry.name)

    add(findEntrypoints(subDir))
    add(findEntrypoints(join(subDir, "src")))
  }

  return entrypoints
}
