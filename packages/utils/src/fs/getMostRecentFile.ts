import { readdir, stat } from "node:fs/promises"
import { join } from "node:path"

export interface GetMostRecentFileOptions {
  dir: string
  /** With or without the leading dot. Omit to consider every file. */
  ext?: string | string[]
}

/** Most recently modified file in `dir`, or null when nothing matches. Not recursive. */
export async function getMostRecentFile({
  dir,
  ext,
}: GetMostRecentFileOptions): Promise<string | null> {
  const exts = ext === undefined ? null : Array.isArray(ext) ? ext : [ext]
  const suffixes = exts?.map((e) => (e.startsWith(".") ? e : `.${e}`)) ?? null
  const entries = await readdir(dir, { withFileTypes: true })

  let newest: { path: string; mtimeMs: number } | null = null
  for (const entry of entries) {
    if (!entry.isFile()) continue
    if (suffixes && !suffixes.some((suffix) => entry.name.endsWith(suffix))) continue

    const path = join(dir, entry.name)
    const { mtimeMs } = await stat(path)
    if (!newest || mtimeMs > newest.mtimeMs) newest = { path, mtimeMs }
  }

  return newest?.path ?? null
}
