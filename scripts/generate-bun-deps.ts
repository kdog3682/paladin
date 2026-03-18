// @paladin/packages/conversation/scripts/generate-bun-deps.ts

import { readFileSync, writeFileSync } from "fs"
import { join, resolve } from "path"

/**
 * Parses a bun.lock (JSONC) and generates a bun-deps.json cache
 * mapping package names to caret version strings.
 *
 * bun.lock packages structure:
 *   "packages": {
 *     "react": ["react@19.0.0", { ... }],
 *     "@types/node": ["@types/node@22.0.0", { ... }],
 *   }
 *
 * The key is the package name, the first array element is "name@version".
 *
 * Usage: bun run generate-bun-deps.ts [project-root]
 */

interface BunLock {
  packages?: Record<string, unknown[]>
}

function parseBunLock(lockPath: string): Record<string, string> {
  const raw = readFileSync(lockPath, "utf-8")
  const parsed = Bun.JSONC.parse(raw) as BunLock

  const packages = parsed.packages
  if (!packages || typeof packages !== "object") {
    throw new Error("No packages field found in bun.lock")
  }

  const cache: Record<string, string> = {}

  for (const [name, entry] of Object.entries(packages)) {
    if (!Array.isArray(entry) || entry.length === 0) continue

    const descriptor = entry[0]
    if (typeof descriptor !== "string") continue

    // descriptor is "name@version" — extract version after last @
    const atIdx = descriptor.lastIndexOf("@")
    if (atIdx <= 0) continue

    const version = descriptor.slice(atIdx + 1)

    // Skip non-registry versions
    if (
      version.startsWith("workspace:") ||
      version.startsWith("file:") ||
      version.startsWith("git+") ||
      version.startsWith("link:") ||
      version.includes("/") || // github shorthand
      version.includes("#")
    ) continue

    // Validate it looks like a semver
    if (!/^\d+\.\d+/.test(version)) continue

    cache[name] = `^${version}`
  }

  return cache
}

function main(): void {
  const projectRoot = resolve(process.argv[2] ?? ".")
  const lockPath = join(projectRoot, "bun.lock")
  const outPath = join(projectRoot, "bun-deps.json")

  console.log(`Reading ${lockPath}...`)

  const cache = parseBunLock(lockPath)
  const sorted = Object.fromEntries(
    Object.entries(cache).sort(([a], [b]) => a.localeCompare(b))
  )

  writeFileSync(outPath, JSON.stringify(sorted, null, 2) + "\n")
  console.log(`Wrote ${Object.keys(sorted).length} entries to ${outPath}`)
}

main()
