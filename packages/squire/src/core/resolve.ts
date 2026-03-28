// @paladin/squire/src/core/resolve.ts

import { join, dirname, basename } from "path"
import { existsSync } from "fs"

export type ResolveResult =
  | { kind: "found", pkg: string, pkgDir: string }
  | { kind: "root" }
  | { kind: "none" }

/**
 * Walk upward from `from` looking for a package.json with a name field.
 * Stop at `root` (monorepo root). If we land on root's own package.json, return "root".
 */
export async function resolveCurrentPkg(from: string, root: string): Promise<ResolveResult> {
  let dir = from

  const fromStat = await Bun.file(from).exists().catch(() => false)
  if (!fromStat) {
    const asDir = Bun.file(join(from, "package.json"))
    if (!(await asDir.exists())) {
      dir = dirname(from)
    }
  }

  while (true) {
    const pkgPath = join(dir, "package.json")
    const file = Bun.file(pkgPath)

    if (await file.exists()) {
      const normalized = dir.replace(/\/$/, "")
      const rootNormalized = root.replace(/\/$/, "")

      if (normalized === rootNormalized) return { kind: "root" }

      const json = await file.json()
      const name = json.name as string | undefined
      const pkg = name ? name.split("/").pop()! : basename(dir)
      return { kind: "found", pkg, pkgDir: dir }
    }

    const parent = dirname(dir)
    if (parent === dir) return { kind: "none" }
    dir = parent
  }
}

/**
 * Scan common monorepo package directories and return discovered packages.
 */
export async function discoverPackages(root: string): Promise<{ name: string, dir: string }[]> {
  const dirs = ["packages", "libs", "apps"]
  const found: { name: string, dir: string }[] = []

  for (const d of dirs) {
    const base = join(root, d)
    if (!existsSync(base)) continue
    const glob = new Bun.Glob("*/package.json")

    for await (const match of glob.scan({ cwd: base, onlyFiles: true })) {
      try {
        const pkgDir = join(base, dirname(match))
        const file = Bun.file(join(base, match))
        const json = await file.json()
        const name = json.name as string | undefined
        const short = name ? name.split("/").pop()! : basename(dirname(match))
        found.push({ name: short, dir: pkgDir })
      } catch {
        continue
      }
    }
  }

  return found.sort((a, b) => a.name.localeCompare(b.name))
}
