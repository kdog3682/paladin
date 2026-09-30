import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"

export type CachedOpts<A extends unknown[]> = {
  /* persist each value as <hash>.json in this dir. in-memory only when omitted */
  dir?: string
  /* builds the cache key from the call args, defaults to the args themselves. return undefined to bypass the cache for that call */
  key?: (...args: A) => unknown
}

export type Cached<A extends unknown[], R> = ((...args: A) => Promise<R>) & {
  /* drop the cached value for these args */
  forget(...args: A): void
  /* drop every cached value */
  clear(): void
}

/* wrap an async fn so repeat calls with the same key return the stored value, optionally persisted to disk */
export function cached<A extends unknown[], R>(
  fn: (...args: A) => Promise<R>,
  opts: CachedOpts<A> = {}
): Cached<A, R> {
  const { dir, key = (...args: A) => args } = opts
  const memory = new Map<string, R>()
  const fileOf = (hash: string) => join(dir!, `${hash}.json`)

  function load(hash: string): R | undefined {
    if (memory.has(hash)) return memory.get(hash)
    if (!dir || !existsSync(fileOf(hash))) return undefined
    try {
      const value = (JSON.parse(readFileSync(fileOf(hash), "utf8")) as { value: R }).value
      memory.set(hash, value)
      return value
    } catch {
      return undefined
    }
  }

  function save(hash: string, k: unknown, value: R) {
    memory.set(hash, value)
    if (!dir) return
    mkdirSync(dir, { recursive: true })
    writeFileSync(fileOf(hash), JSON.stringify({ key: k, value, createdAt: new Date().toISOString() }, null, 2))
  }

  const wrapped = async (...args: A) => {
    const k = key(...args)
    if (k === undefined) return fn(...args)

    const hash = hashKey(k)
    const hit = load(hash)
    if (hit !== undefined) return hit

    const value = await fn(...args)
    if (value !== undefined) save(hash, k, value)
    return value
  }

  return Object.assign(wrapped, {
    forget(...args: A) {
      const k = key(...args)
      if (k === undefined) return
      const hash = hashKey(k)
      memory.delete(hash)
      if (dir) rmSync(fileOf(hash), { force: true })
    },
    clear() {
      memory.clear()
      if (dir) rmSync(dir, { recursive: true, force: true })
    },
  })
}

function hashKey(key: unknown): string {
  const text = typeof key === "string" ? key : JSON.stringify(key)
  return createHash("sha256").update(text).digest("hex").slice(0, 32)
}
