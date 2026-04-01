// @paladin/conversation-processor/file-tracker.ts

import { existsSync } from "fs"
import { readFile, writeFile, mkdir } from "fs/promises"
import { dirname, join } from "path"
import { paladinPath } from "./utils/paladin-path"

export type FileTracker = {
  get(filePath: string): string | null
  set(filePath: string, processedAt: string): void
  has(filePath: string): boolean
  isStale(filePath: string, updatedAt: string): boolean
  flush(): Promise<void>
}

type Store = Record<string, string>

export async function createFileTracker(
  projectName: string,
  storageRoot?: string,
): Promise<FileTracker> {
  const filePath = storageRoot
    ? join(storageRoot, "cache", "processed", `${projectName}.json`)
    : paladinPath("cache", "processed", `${projectName}.json`)
  let store: Store = {}

  if (existsSync(filePath)) {
    const raw = await readFile(filePath, "utf-8")
    store = JSON.parse(raw)
  }

  return {
    get: (path) => store[path] ?? null,

    set: (path, processedAt) => {
      store[path] = processedAt
    },

    has: (path) => path in store,

    isStale: (path, updatedAt) => {
      const prev = store[path]
      if (!prev) return true
      return updatedAt > prev
    },

    flush: async () => {
      await mkdir(dirname(filePath), { recursive: true })
      await writeFile(filePath, JSON.stringify(store, null, 2))
    },
  }
}
