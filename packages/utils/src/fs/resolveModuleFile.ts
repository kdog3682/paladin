import { existsSync } from "node:fs"
import { join } from "node:path"

export type ResolveModuleFileOptions = {
  /** Extensions tried in order. Defaults to [".ts", ".tsx"]. */
  extensions?: string[]
  /** Index files tried when the base resolves to a directory. Defaults to ["index", "src/index"]. */
  indexes?: string[]
}

/**
 * Resolve a module base path to the file on disk that backs it, trying the bare
 * path, each extension, and each index file in turn. Returns null when nothing exists.
 */
export function resolveModuleFile(
  base: string,
  options: ResolveModuleFileOptions = {},
): string | null {
  const { extensions = [".ts", ".tsx"], indexes = ["index", "src/index"] } = options
  const candidates: string[] = []
  if (extensions.some((ext) => base.endsWith(ext))) candidates.push(base)
  for (const ext of extensions) candidates.push(`${base}${ext}`)
  for (const index of indexes) {
    for (const ext of extensions) candidates.push(join(base, `${index}${ext}`))
  }
  return candidates.find((candidate) => existsSync(candidate)) ?? null
}
