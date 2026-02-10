// @paladin/web/src/stores/log.ts

import { create } from "zustand"

export interface LogEntry {
  id: string
  timestamp: number
  kind: "info" | "success" | "error" | "warn"
  message: string
  detail?: string
}

interface LogState {
  entries: LogEntry[]
  push: (kind: LogEntry["kind"], message: string, detail?: string) => void
  clear: () => void
}

let counter = 0

export const useLogStore = create<LogState>((set) => ({
  entries: [],
  push: (kind, message, detail) =>
    set((s) => ({
      entries: [
        ...s.entries,
        { id: String(++counter), timestamp: Date.now(), kind, message, detail },
      ],
    })),
  clear: () => set({ entries: [] }),
}))
