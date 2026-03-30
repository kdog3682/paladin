// @paladin/fcache/index.ts
import { statSync } from "fs"
import { eq } from "drizzle-orm"
import { db } from "./db"
import { cacheEntries } from "./schema"
import { serialize, deserialize } from "./coerce"

type FileFn<T> = (file: string) => T | Promise<T>

function deriveKey(fnName: string, callerFile: string, filePath: string) {
  return `${fnName}:${callerFile}:${filePath}`
}

function getCallerFile(): string {
  const err = new Error()
  const lines = err.stack?.split("\n") ?? []
  // [0] Error, [1] getCallerFile, [2] fcache, [3] actual caller
  const callerLine = lines[3] ?? "unknown"
  const match = callerLine.match(/\((.+?):\d+:\d+\)/) ?? callerLine.match(/at (.+?):\d+:\d+/)
  return match?.[1] ?? "unknown"
}

export function fcache<T>(fn: FileFn<T>): (file: string) => Promise<T> {
  const fnName = fn.name || "anonymous"
  const callerFile = getCallerFile()

  return async (file: string): Promise<T> => {
    const key = deriveKey(fnName, callerFile, file)
    const mtime = statSync(file).mtimeMs

    const [row] = await db
      .select()
      .from(cacheEntries)
      .where(eq(cacheEntries.key, key))
      .limit(1)

    if (row && row.mtime === Math.floor(mtime)) {
      return deserialize({ type: row.type, value: row.value }) as T
    }

    const result = await fn(file)
    const { type, value } = serialize(result)

    await db
      .insert(cacheEntries)
      .values({ key, value, type, mtime: Math.floor(mtime) })
      .onConflictDoUpdate({
        target: cacheEntries.key,
        set: { value, type, mtime: Math.floor(mtime) },
      })

    return result
  }
}
