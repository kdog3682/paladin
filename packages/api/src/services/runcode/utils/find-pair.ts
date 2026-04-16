// src/services/runcode/utils/find-pair.ts

import { existsSync } from "node:fs"
import { basename, dirname, join, extname } from "node:path"

export function findPair(file: string, suffix: string): string | null {
  const base = basename(file)
  const dir = dirname(file)

  if (base.includes(suffix)) {
    const sourceName = base.replace(suffix, ".")
    const candidate = join(dir, sourceName)
    return existsSync(candidate) ? candidate : null
  }

  const ext = extname(file)
  const stem = base.slice(0, -ext.length)
  const handlerName = `${stem}${suffix}${ext.slice(1)}`
  const candidate = join(dir, handlerName)
  return existsSync(candidate) ? candidate : null
}
