// @paladin/fcache/src/index.ts
import { statSync, mkdirSync, readFileSync, writeFileSync } from "fs"

const CACHE_DIR = `${process.env.HOME}/.cache/paladin/fcache`

type Entry = { mtime: number; data: unknown }
type Store = Record<string, Entry>

function getCallerFile(): string {
  const err = new Error()
  const lines = err.stack?.split("\n") ?? []
  // [0] Error, [1] getCallerFile, [2] fcache, [3] actual caller
  const callerLine = lines[3] ?? "unknown"
  const match = callerLine.match(/\((.+?):\d+:\d+\)/) ?? callerLine.match(/at (.+?):\d+:\d+/)
  return match?.[1] ?? "unknown"
}

function cacheFile(fnName: string, callerFile: string): string {
  const key = `${fnName}:${callerFile}`
  const hash = Bun.hash(key).toString(36)
  return `${CACHE_DIR}/${hash}.json`
}

function loadStore(path: string): Store {
  try {
    return JSON.parse(readFileSync(path, "utf-8"))
  } catch {
    return {}
  }
}

function saveStore(path: string, store: Store) {
  mkdirSync(CACHE_DIR, { recursive: true })
  writeFileSync(path, JSON.stringify(store))
}

type FileFn<T> = (file: string) => T | Promise<T>

export function fcache<T>(fn: FileFn<T>): (file: string) => Promise<T> {
  const fnName = fn.name || "anonymous"
  const callerFile = getCallerFile()
  const path = cacheFile(fnName, callerFile)
  const store = loadStore(path)

  return async (file: string): Promise<T> => {
    const mtime = Math.floor(statSync(file).mtimeMs)
    const entry = store[file]

    if (entry && entry.mtime === mtime) {
      return entry.data as T
    }

    const result = await fn(file)
    store[file] = { mtime, data: result }
    saveStore(path, store)
    return result
  }
}
