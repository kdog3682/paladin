// src/components/SessionMonitor/store.ts

import { create } from "zustand"
import type { SessionData } from "./types"

interface SessionMonitorState {
  session: SessionData | null
  connected: boolean
  setSession: (session: SessionData) => void
  setConnected: (connected: boolean) => void
}

export const useSessionMonitor = create<SessionMonitorState>((set) => ({
  session: null,
  connected: false,
  setSession: (session) => set({ session }),
  setConnected: (connected) => set({ connected }),
}))
