import { createContext, useContext, type ReactNode } from "react"
import { useStore } from "zustand"
import type { PaletteInstance } from "./createPalette"
import type { Page, PaletteState } from "./types"

/* the components are context-agnostic, so the instance is stored untyped */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyPalette = PaletteInstance<any, any>

const PaletteContext = createContext<AnyPalette | null>(null)

export type PaletteProviderProps<Ctx, R> = {
  palette: PaletteInstance<Ctx, R>
  children: ReactNode
}

export function PaletteProvider<Ctx, R>({ palette, children }: PaletteProviderProps<Ctx, R>) {
  return <PaletteContext.Provider value={palette}>{children}</PaletteContext.Provider>
}

export function usePalette<Ctx = unknown, R = unknown>(): PaletteInstance<Ctx, R> {
  const palette = useContext(PaletteContext)
  if (!palette) throw new Error("usePalette must be used inside <PaletteProvider>")
  return palette
}

/* selectors must return stable references (primitives or existing state objects) */
export function usePaletteState<T>(selector: (state: PaletteState<unknown, unknown>) => T): T {
  const palette = usePalette()
  return useStore(palette.store, selector)
}

export function useTopPage(): Page<unknown, unknown> {
  return usePaletteState((s) => s.pages[s.pages.length - 1])
}
