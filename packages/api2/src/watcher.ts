import { watch } from "node:fs"
import { stat } from "node:fs/promises"
import { join } from "node:path"

type WatcherCallback = (path: string) => Promise<void> | void

function resolveDir(): string {
  const dir = process.env.DOWNLOAD_DIR
  if (!dir) {
    throw new Error("DOWNLOAD_DIR is not set")
  }
  return dir
}

/** Sleep that resolves early when the signal aborts, and never holds the loop open. */
function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve()
      return
    }
    const finish = () => {
      clearTimeout(timer)
      signal.removeEventListener("abort", finish)
      resolve()
    }
    const timer = setTimeout(finish, ms)
    timer.unref?.()
    signal.addEventListener("abort", finish, { once: true })
  })
}

/** Wait until a file's size stops changing. */
async function waitForStable(
  path: string,
  signal: AbortSignal,
  settleMs = 250,
): Promise<boolean> {
  let previousSize = -1
  for (let i = 0; i < 40; i++) {
    if (signal.aborted) return false
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
    await sleep(settleMs, signal)
  }
  return !signal.aborted
}

/**
 * Watch the download directory for newly created files.
 *
 * Returns a function that stops watching and cancels any in-flight settle loop.
 */
export function createWatcher(callback: WatcherCallback): () => void {
  const dir = resolveDir()
  const processing = new Set<string>()
  const controller = new AbortController()
  const signal = controller.signal

  const watcher = watch(dir, async (event, filename) => {
    if (signal.aborted) return
    if (event !== "rename" || !filename) return
    if (filename.startsWith(".") || filename.endsWith(".crdownload")) {
      return
    }

    const path = join(dir, filename)
    if (processing.has(path)) return
    processing.add(path)

    try {
      if (!(await waitForStable(path, signal))) return
      if (signal.aborted) return
      await callback(path)
    } catch (error) {
      console.error(`watcher callback failed for ${path}`, error)
    } finally {
      processing.delete(path)
    }
  })

  watcher.unref()

  return () => {
    controller.abort()
    watcher.close()
  }
}
