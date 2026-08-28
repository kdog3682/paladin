import { statSync } from "node:fs"

import { dirname, extname, join, resolve } from "node:path"

const EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"]

// `from` may be the importing file itself or its containing directory.
// treat it as a file (and take its dirname) when it looks like one.
function baseDir(from: string): string {
  return extname(from) || isFile(from) ? dirname(from) : from
}

export function resolveRelativePath(source: string, from: string): string | undefined {
  const dir = baseDir(from)
  try {
    const resolved = Bun.resolveSync(source, dir)
    if (isFile(resolved)) return resolved
  } catch {}
  return probe(resolve(dir, source))
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}

function probe(base: string): string | undefined {
  if (isFile(base)) return base
  const stems = [base.replace(/\.(m|c)?js$/, "")]
  if (stems[0] !== base) stems.push(base)
  for (const stem of stems) {
    for (const ext of EXTENSIONS) {
      const candidate = stem + ext
      if (isFile(candidate)) return candidate
    }
    for (const ext of EXTENSIONS) {
      const candidate = join(stem, `index${ext}`)
      if (isFile(candidate)) return candidate
    }
  }
  return undefined
}
