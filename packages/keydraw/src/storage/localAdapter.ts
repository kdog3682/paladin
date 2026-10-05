import type { StorageAdapter } from "./adapter"

/* localStorage caps out around 5MB; an idb-keyval adapter is the fallback */
export const localAdapter: StorageAdapter = {
  load: key => localStorage.getItem(key),
  save: (key, value) => {
    try {
      localStorage.setItem(key, value)
    } catch (err) {
      console.warn("[keydraw] save failed", err)
    }
  },
  remove: key => localStorage.removeItem(key),
  list: prefix => Object.keys(localStorage).filter(k => k.startsWith(prefix)),
}
