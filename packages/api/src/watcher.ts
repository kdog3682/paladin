// src/watcher.ts

import { watch } from "node:fs"
import { stat } from "node:fs/promises"
import { join } from "node:path"

type WatcherOptions = {
  dir: string
  callback: (path: string) => Promise<void> | void
}

/** Wait until a file's size stops changing. */
async function waitForStable(
  path: string,
  settleMs = 250,
): Promise<boolean> {
  let previousSize = -1

  for (let i = 0; i < 40; i++) {
    let size: number

    try {
      size = (await stat(path)).size
    } catch {
      return false
    }

    if (size === previousSize && size > 0) {
      return true
    }

    previousSize = size
    await Bun.sleep(settleMs)
  }

  return true
}

/**
 * Watch a directory for newly created files.
 *
 * Returns a function that stops watching.
 */
export function createWatcher({
  dir,
  callback,
}: WatcherOptions): () => void {
  const processing = new Set<string>()

  const watcher = watch(dir, async (event, filename) => {
    if (event !== "rename" || !filename) return

    if (
      filename.startsWith(".") ||
      filename.endsWith(".crdownload")
    ) {
      return
    }

    const path = join(dir, filename)

    if (processing.has(path)) {
      return
    }

    processing.add(path)

    try {
      if (!(await waitForStable(path))) {
        return
      }

      await callback(path)
    } finally {
      processing.delete(path)
    }
  })

  return () => watcher.close()
}