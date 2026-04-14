// src/stores/appletStore.ts

import { create } from 'zustand'

export interface AppletDefinition {
  id: string
  label: string
  shortcut: string // "1", "2", etc
  component: React.ComponentType
}

interface AppletState {
  applets: AppletDefinition[]
  activeId: string | null
  setActive: (id: string) => void
  register: (applets: AppletDefinition[]) => void
}

export const useAppletStore = create<AppletState>((set) => ({
  applets: [],
  activeId: null,

  setActive(id) {
    set({ activeId: id })
  },

  register(applets) {
    set({ applets, activeId: applets[0]?.id ?? null })
  },
}))
