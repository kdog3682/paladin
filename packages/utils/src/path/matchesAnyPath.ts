import { Glob } from "bun"

const normalize = (path: string) => path.replaceAll("\\", "/").replace(/\/+$/, "")

/**
 * A pattern matches when it globs the path, or when it appears in it as a run of
 * whole segments — so `packages/utils` matches `/home/me/paladin/packages/utils`
 * and `/repo/packages/utils/src/index.ts`, but never `packages/utils-legacy`.
 */
export function matchesAnyPath(path: string, patterns: string[]): boolean {
  const target = normalize(path)

  return patterns.some((pattern) => {
    const p = normalize(pattern).replace(/^\.?\/+/, "")
    if (!p) return false
    if (target === p || target.endsWith(`/${p}`) || target.includes(`/${p}/`)) return true
    return new Glob(p).match(target)
  })
}
