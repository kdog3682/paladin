// @paladin/scribe-api/src/lib/file-tree.ts

import { readdir } from "node:fs/promises"
import { join } from "node:path"

export interface FileEntry {
  path: string
  name: string
  type: "file" | "directory"
  children?: FileEntry[]
}

export function safeRegex(pattern: string | null | undefined): RegExp | null {
  if (!pattern) return null
  try {
    return new RegExp(pattern, "i")
  } catch {
    return null
  }
}

export async function walkDir(
  dir: string,
  includeRe: RegExp | null,
  excludeRe: RegExp | null,
  globalIncludeRe: RegExp | null,
  globalExcludeRe: RegExp | null
): Promise<FileEntry[]> {
  let items
  try {
    items = await readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }

  const entries: FileEntry[] = []

  for (const item of items) {
    const fullPath = join(dir, item.name)

    if (globalExcludeRe?.test(fullPath)) continue
    if (excludeRe?.test(fullPath)) continue

    if (item.isDirectory()) {
      const children = await walkDir(fullPath, includeRe, excludeRe, globalIncludeRe, globalExcludeRe)
      if (children.length > 0) {
        entries.push({ path: fullPath, name: item.name, type: "directory", children })
      }
    } else {
      // if no include patterns are set, include everything
      const passGlobal = !globalIncludeRe || globalIncludeRe.test(fullPath)
      const passLocal = !includeRe || includeRe.test(fullPath)
      if (passGlobal && passLocal) {
        entries.push({ path: fullPath, name: item.name, type: "file" })
      }
    }
  }

  return entries.sort((a, b) => {
    if (a.type !== b.type) return a.type === "directory" ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}
