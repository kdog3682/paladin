import { create } from 'zustand'
import type { EditorView } from '@codemirror/view'

export type EditorStore = {
  /* the live EditorView, so hotkeys can drive the editor without prop drilling */
  view: EditorView | null
  setView: (view: EditorView | null) => void
}

export const useEditorStore = create<EditorStore>(set => ({
  view: null,
  setView: view => set({ view }),
}))

export const useEditorView = () => useEditorStore(s => s.view)
