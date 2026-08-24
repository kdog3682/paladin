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

// JSON.stringify silently drops object keys whose value is `undefined`, so a
// cache round-trip can hand back an object with fewer keys than what `fn`
// originally produced. Encode/decode `undefined` explicitly to make the
// round-trip lossless.
const UNDEFINED_MARKER = "__fcache_undefined__"

function replacer(_key: string, value: unknown) {
  return value === undefined ? UNDEFINED_MARKER : value
}

// A reviver can't restore `undefined`-valued keys: JSON.parse deletes any
// property whose reviver call returns undefined. Walk the parsed tree
// instead and reassign those keys explicitly so they stay present.
function restoreUndefined(value: unknown): unknown {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      value[i] = restoreUndefined(value[i])
    }
    return value
  }
  if (value && typeof value === "object") {
    for (const key of Object.keys(value)) {
      const v = (value as Record<string, unknown>)[key]
      ;(value as Record<string, unknown>)[key] = v === UNDEFINED_MARKER ? undefined : restoreUndefined(v)
    }
    return value
  }
  return value
}

function loadStore(path: string): Store {
  try {
    return restoreUndefined(JSON.parse(readFileSync(path, "utf-8"))) as Store
  } catch {
    return {}
  }
}

function saveStore(path: string, store: Store) {
  mkdirSync(CACHE_DIR, { recursive: true })
  writeFileSync(path, JSON.stringify(store, replacer))
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
