// @paladin/web/src/stores/settings.ts

import { create } from "zustand"
import { persist } from "zustand/middleware"

export type ModelAlias = "haiku" | "sonnet" | "opus"
export type ProjectType = "typescript" | "python"

interface SettingsState {
  model: ModelAlias
  projectType: ProjectType
  setModel: (model: ModelAlias) => void
  setProjectType: (type: ProjectType) => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      model: "sonnet",
      projectType: "typescript",
      setModel: (model) => set({ model }),
      setProjectType: (projectType) => set({ projectType }),
    }),
    {
      name: "paladin-settings",
    }
  )
)
