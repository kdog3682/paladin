// @paladin/squire/src/utils/files.ts

import { readdir } from "fs/promises"
import { join } from "path"

export type FileKind = "test" | "demo" | "mochi"

const PATTERNS: Record<FileKind, RegExp> = {
  test: /\.test\.ts$/,
  demo: /\.demo\.ts$/,
  mochi: /\.mochi\.ts$/,
}

export async function collectSrc(pkgDir: string): Promise<string[]> {
  const srcDir = join(pkgDir, "src")
  const entries = await readdir(srcDir, { withFileTypes: true, recursive: true })
  const out: string[] = []
  for (const e of entries) {
    if (!e.isFile()) continue
    out.push(join(e.parentPath, e.name))
  }
  return out
}

export function discover(
  files: string[],
  kind: FileKind,
  filters?: string[]
): string[] {
  const pattern = PATTERNS[kind]
  let matched = files.filter((f) => pattern.test(f))

  if (filters?.length) {
    matched = matched.filter((f) =>
      filters.some((q) => f.includes(q))
    )
  }

  return matched
}
