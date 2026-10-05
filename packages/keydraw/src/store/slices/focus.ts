import { boardOfRoot, currentRoot, rootOf } from "../../model/tree"
import type { Slice } from "../useEditor"

export type FocusSlice = {
  /* the one focused node; never empty once the store is ready */
  focus: string
  /* parent id → last focused child, for drilling back in with → */
  lastVisited: Record<string, string>
  setFocus: (id: string) => void
  /* re-points focus and selection at existing nodes (after undo, delete, reload) */
  repairFocus: () => void
}

export const createFocusSlice: Slice<FocusSlice> = (set, get) => ({
  focus: "",
  lastVisited: {},

  setFocus: id => {
    const s = get()
    const doc = s.doc
    if (!doc.nodes[id]) return
    const lastVisited = { ...s.lastVisited }
    let cur = id
    while (doc.nodes[cur].parent) {
      const p = doc.nodes[cur].parent!
      lastVisited[p] = cur
      cur = p
    }
    const board = boardOfRoot(doc, cur)
    if (board && board.id !== doc.currentBoard) {
      s.setDoc(d => {
        d.currentBoard = board.id
      })
    }
    set({ focus: id, lastVisited })
  },

  repairFocus: () => {
    const s = get()
    const doc = s.doc
    const root = currentRoot(doc)
    const focus = doc.nodes[s.focus] && rootOf(doc, s.focus) === root ? s.focus : root
    const alive = (ids: string[]) => ids.filter(id => doc.nodes[id])
    set({
      focus,
      selected: alive(s.selected),
      selStack: s.selStack.map(e => ({ selected: alive(e.selected), focus: doc.nodes[e.focus] ? e.focus : focus })),
    })
  },
})
