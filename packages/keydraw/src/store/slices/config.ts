import { emptyOverride, type KeymapOverride } from "../../keys/keymap.default"
import type { Slice } from "../useEditor"

export type Settings = {
  /* :set search board|doc */
  search: "board" | "doc"
  /* :set attrs configured|all */
  attrs: "configured" | "all"
}

export type ConfigSlice = {
  /* user keymap layer over keymap.default.ts; replaced (not mutated) on change */
  keymapOverride: KeymapOverride
  settings: Settings
  setSettings: (s: Partial<Settings>) => void
}

export const createConfigSlice: Slice<ConfigSlice> = (set, get) => ({
  keymapOverride: emptyOverride,
  settings: { search: "board", attrs: "configured" },
  setSettings: s => set({ settings: { ...get().settings, ...s } }),
})
