import { readdir, stat } from "node:fs/promises"
import { join } from "node:path"

export interface GetMostRecentFileOptions {
  dir: string
  /** With or without the leading dot. Omit to consider every file. */
  ext?: string
}

/** Most recently modified file in `dir`, or null when nothing matches. Not recursive. */
export async function getMostRecentFile({
  dir,
  ext,
}: GetMostRecentFileOptions): Promise<string | null> {
  const suffix = ext ? (ext.startsWith(".") ? ext : `.${ext}`) : null
  const entries = await readdir(dir, { withFileTypes: true })

  let newest: { path: string; mtimeMs: number } | null = null
  for (const entry of entries) {
    if (!entry.isFile()) continue
    if (suffix && !entry.name.endsWith(suffix)) continue

    const path = join(dir, entry.name)
    const { mtimeMs } = await stat(path)
    if (!newest || mtimeMs > newest.mtimeMs) newest = { path, mtimeMs }
  }

  return newest?.path ?? null
}
