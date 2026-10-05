import type { EditorState, Slice } from "../useEditor"

export type SelectionFrame = { selected: string[], focus: string }

export type SelectionSlice = {
  /* explicit selection; empty means "just the focused node" */
  selected: string[]
  /* pushed by vv, popped by v- */
  selStack: SelectionFrame[]
  toggleSelect: (id: string) => void
  clearSelection: () => void
}

/* what operators and Input mode act on */
export function selectionOf(s: Pick<EditorState, "selected" | "focus">): string[] {
  return s.selected.length ? s.selected : [s.focus]
}

export const createSelectionSlice: Slice<SelectionSlice> = (set, get) => ({
  selected: [],
  selStack: [],

  toggleSelect: id => {
    const sel = get().selected
    set({ selected: sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id] })
  },

  clearSelection: () => set({ selected: [], selStack: [] }),
})
