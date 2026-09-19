import { watch } from "node:fs"
import { stat } from "node:fs/promises"
import { join } from "node:path"

type WatcherCallback = (paths: string[]) => Promise<void> | void

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

export type WatcherOptions = {
  /** Quiet period after the last file arrives before the batch is handed over. Each new file restarts it. */
  groupWaitMs?: number
}

/**
 * Watch the download directory for newly created files.
 *
 * Files often trickle in from several downloads, so settled files are collected and
 * handed to the callback together once no new file has arrived for `groupWaitMs`.
 * Every arrival (and every file finishing its settle) restarts that wait.
 *
 * Returns a function that stops watching and cancels any in-flight settle loop.
 */
export function createWatcher(
  callback: WatcherCallback,
  { groupWaitMs = 1500 }: WatcherOptions = {},
): () => void {
  const dir = resolveDir()
  const seen = new Set<string>()
  const controller = new AbortController()
  const signal = controller.signal

  let batch: string[] = []
  let settling = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  let running: Promise<void> = Promise.resolve()

  const flush = () => {
    const paths = batch
    batch = []
    if (!paths.length) return
    running = running.then(async () => {
      if (signal.aborted) return
      try {
        await callback(paths)
      } catch (error) {
        console.error(`watcher callback failed for ${paths.join(", ")}`, error)
      } finally {
        for (const path of paths) seen.delete(path)
      }
    })
  }

  const schedule = () => {
    clearTimeout(timer)
    if (settling > 0 || signal.aborted) return
    timer = setTimeout(flush, groupWaitMs)
    timer.unref?.()
  }

  const watcher = watch(dir, async (event, filename) => {
    if (signal.aborted) return
    if (event !== "rename" || !filename) return
    if (filename.startsWith(".") || filename.endsWith(".crdownload")) {
      return
    }

    const path = join(dir, filename)
    if (seen.has(path)) return
    seen.add(path)

    clearTimeout(timer)
    settling++
    let stable = false
    try {
      stable = await waitForStable(path, signal)
    } finally {
      settling--
    }

    if (stable) batch.push(path)
    else seen.delete(path)
    schedule()
  })

  watcher.unref()

  return () => {
    controller.abort()
    clearTimeout(timer)
    watcher.close()
  }
}
