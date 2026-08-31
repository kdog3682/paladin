/*
a lazily loaded, write-buffered json cache.

  const cache = createCache<string>("/root/snapshots/foo.examples.ts.cache.json")

  if (!(await cache.has(key))) cache.set(key, await expensive())
  await cache.save()

reads hit disk once. set() only marks dirty, so save() is a no-op when
nothing changed and the file is written at most once per run.
*/

import { dirname } from "node:path"

export type Cache<T> = {
  has: (key: string) => Promise<boolean>
  get: (key: string) => Promise<T | undefined>
  set: (key: string, value: T) => void
  delete: (key: string) => void
  keys: () => Promise<string[]>
  save: () => Promise<void>
}

export function createCache<T>(path: string): Cache<T> {
  let data: Record<string, T> | null = null
  let dirty = false

  async function load() {
    if (data) return data
    const file = Bun.file(path)
    data = (await file.exists()) ? await file.json() : {}
    return data
  }

  return {
    async has(key) {
      return key in (await load())
    },
    async get(key) {
      return (await load())[key]
    },
    set(key, value) {
      if (!data) throw new Error("createCache: read a key before setting one")
      data[key] = value
      dirty = true
    },
    delete(key) {
      if (!data) throw new Error("createCache: read a key before deleting one")
      delete data[key]
      dirty = true
    },
    async keys() {
      return Object.keys(await load())
    },
    async save() {
      if (!dirty || !data) return
      await Bun.write(path, JSON.stringify(data, null, 2))
      dirty = false
    },
  }
}
