import type { StateStorage } from "zustand/middleware"

export type StorageAdapter = {
  load: (key: string) => string | null | Promise<string | null>
  save: (key: string, value: string) => void | Promise<void>
  remove: (key: string) => void | Promise<void>
  /* keys starting with prefix, e.g. every stored document */
  list: (prefix: string) => string[] | Promise<string[]>
}

/* zustand persist storage over an adapter; writes are debounced and flushed on unload */
export function toStateStorage(adapter: StorageAdapter, debounceMs = 250): StateStorage {
  const pending = new Map<string, string>()
  let timer: ReturnType<typeof setTimeout> | undefined

  const flush = () => {
    timer = undefined
    for (const [k, v] of pending) void adapter.save(k, v)
    pending.clear()
  }

  if (typeof window !== "undefined") window.addEventListener("beforeunload", flush)

  return {
    getItem: name => pending.get(name) ?? adapter.load(name),
    setItem: (name, value) => {
      pending.set(name, value)
      if (!timer) timer = setTimeout(flush, debounceMs)
    },
    removeItem: name => {
      pending.delete(name)
      return adapter.remove(name)
    },
  }
}
