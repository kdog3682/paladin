// @paladin/json-viewer-backend/src/scanner.ts

import { readdir, stat } from "fs/promises"
import { homedir } from "os"
import { join, extname, basename } from "path"

export interface JsonFileEntry {
  name: string
  path: string
  mtime: number
}

const SCRATCH_DIR = join(homedir(), "scratch")

// matches "name (N).json" pattern
const DUPE_PATTERN = /^(.+?)\s*\((\d+)\)\.json$/i

function deduplicateFiles(files: JsonFileEntry[]): JsonFileEntry[] {
  const groups = new Map<string, JsonFileEntry[]>()

  for (const file of files) {
    const name = basename(file.name)
    const dupeMatch = name.match(DUPE_PATTERN)

    const baseKey = dupeMatch
      ? dupeMatch[1].toLowerCase() + ".json"
      : name.toLowerCase()

    if (!groups.has(baseKey)) {
      groups.set(baseKey, [])
    }
    groups.get(baseKey)!.push(file)
  }

  const result: JsonFileEntry[] = []

  for (const entries of groups.values()) {
    if (entries.length === 1) {
      result.push(entries[0])
      continue
    }

    // pick the highest-numbered duplicate
    let best = entries[0]
    let bestNum = -1

    for (const entry of entries) {
      const match = basename(entry.name).match(DUPE_PATTERN)
      const num = match ? parseInt(match[2], 10) : 0
      if (num > bestNum) {
        bestNum = num
        best = entry
      }
    }

    result.push(best)
  }

  return result
}

export async function scanJsonFiles(): Promise<JsonFileEntry[]> {
  const entries = await readdir(SCRATCH_DIR)

  const files: JsonFileEntry[] = []

  for (const entry of entries) {
    if (extname(entry).toLowerCase() !== ".json") continue

    const fullPath = join(SCRATCH_DIR, entry)
    const info = await stat(fullPath)

    if (!info.isFile()) continue

    files.push({
      name: entry,
      path: fullPath,
      mtime: info.mtimeMs,
    })
  }

  const deduped = deduplicateFiles(files)

  // sort by mtime ascending — most recent last (fzf bottom)
  deduped.sort((a, b) => a.mtime - b.mtime)

  return deduped
}
