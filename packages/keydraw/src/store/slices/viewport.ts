import type { Slice } from "../useEditor"

export type ViewportState = {
  x: number
  y: number
  zoom: number
  /* false until the first fit, so a fresh doc opens fitted and a reload keeps its pan/zoom */
  fitted: boolean
}

export type ViewportSlice = {
  viewport: ViewportState
  setViewport: (v: Partial<ViewportState>) => void
}

export const createViewportSlice: Slice<ViewportSlice> = (set, get) => ({
  viewport: { x: 0, y: 0, zoom: 1, fitted: false },
  setViewport: v => set({ viewport: { ...get().viewport, ...v } }),
})
