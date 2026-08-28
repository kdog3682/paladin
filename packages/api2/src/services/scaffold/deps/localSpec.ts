import { existsSync } from "node:fs"
import { join, relative } from "node:path"

const dirs = new Map<string, boolean>()

/** `@paladin/utils/collectImports` -> `@paladin/utils`, `lodash/fp` -> `lodash`. */
export function packageRoot(source: string): string {
  const parts = source.split("/")
  return source.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0]!
}

function ownerOf(source: string): string {
  return (source.startsWith("@") ? source.slice(1) : source).split("/")[0]!
}

function exists(dir: string): boolean {
  const cached = dirs.get(dir)
  if (cached !== undefined) return cached

  const found = existsSync(dir)
  dirs.set(dir, found)
  return found
}

/**
 * A root under the project's own scope is a sibling unit, so `workspace:*` covers
 * it. Anything else is still local when its project dir exists under `base` —
 * `@paladin/utils` seen from `@mathpen/manim` is `<base>/paladin/packages/utils`,
 * linked by relative path since it lives outside this workspace. `null` means
 * it's an npm package.
 */
export function localSpec(root: string, from: string, scope: string, base: string): string | null {
  if (ownerOf(root) === scope) return "workspace:*"

  const owner = ownerOf(root)
  if (!exists(join(base, owner))) return null

  const [, pkg] = root.split("/")
  const dir = join(base, owner, "packages", pkg!)
  const path = relative(from, dir)
  return `file:${path.startsWith(".") ? path : `./${path}`}`
}
