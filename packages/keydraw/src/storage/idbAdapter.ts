import type { StorageAdapter } from "./adapter"

/* IndexedDB through idb-keyval, loaded on first use so environments without it still work */
const idb = () => import("idb-keyval")

export const idbAdapter: StorageAdapter = {
  load: async key => ((await (await idb()).get(key)) as string | undefined) ?? null,
  save: async (key, value) => (await idb()).set(key, value),
  remove: async key => (await idb()).del(key),
  list: async prefix => ((await (await idb()).keys()) as string[]).filter(k => typeof k === "string" && k.startsWith(prefix)),
}

/*
 * localStorage first (§16: capped at about 5MB); a write that no longer fits moves that key to IndexedDB.
 * Reads check both, so a key that overflowed keeps loading.
 */
/* adapters may be sync or async, and the fallback may be unavailable */
async function safe<T>(fn: () => T | Promise<T>, onError: T): Promise<T> {
  try {
    return await fn()
  } catch {
    return onError
  }
}

export function hybridAdapter(local: StorageAdapter, fallback: StorageAdapter = idbAdapter): StorageAdapter {
  return {
    load: async key => (await local.load(key)) ?? (await safe(() => fallback.load(key), null)),
    save: async (key, value) => {
      try {
        // the local adapter swallows quota errors; probe by reading back
        await local.save(key, value)
        if ((await local.load(key)) === value) {
          await safe(() => fallback.remove(key), undefined)
          return
        }
      } catch {
        /* fall through to the fallback */
      }
      await fallback.save(key, value)
    },
    remove: async key => {
      await local.remove(key)
      await safe(() => fallback.remove(key), undefined)
    },
    list: async prefix => {
      const [a, b] = await Promise.all([local.list(prefix), safe(() => fallback.list(prefix), [] as string[])])
      return [...new Set([...a, ...b])]
    },
  }
}
