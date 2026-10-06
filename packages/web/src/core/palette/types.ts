import type {
  PaletteCommand,
  PaletteEntry,
  PaletteInstance,
  PaletteItem,
  SearchProvider,
} from "@paladin/ui"
import type { FocusRegion } from "./deps"

export type PaladinCtx = {
  /* focus region active when the palette opened */
  origin: FocusRegion
  projectId: string
  sessionId: string
}

export type PaladinResult = {
  focus?: "restore" | "panel" | "editor"
}

export type PaladinCommand = PaletteCommand<PaladinCtx, PaladinResult>
export type PaladinProvider = SearchProvider<PaladinCtx, PaladinResult>
export type PaladinItem = PaletteItem<PaladinCtx, PaladinResult>
export type PaladinEntry = PaletteEntry<PaladinCtx, PaladinResult>
export type PaladinPalette = PaletteInstance<PaladinCtx, PaladinResult>
