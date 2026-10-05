import { create } from "zustand"

type AttrsPanelState = {
  /* index of the focused row while the panel has focus (`I`) */
  row: number
  /* prop name being edited inline, or null */
  editing: string | null
  setRow: (row: number) => void
  setEditing: (name: string | null) => void
}

/* UI-only state, not persisted: like uncommitted typing, an open inline edit is dropped on reload. */
export const useAttrsPanel = create<AttrsPanelState>((set) => ({
  row: 0,
  editing: null,
  setRow: (row) => set({ row }),
  setEditing: (editing) => set({ editing }),
}))
