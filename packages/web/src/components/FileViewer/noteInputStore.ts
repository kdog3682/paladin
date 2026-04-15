// src/components/FileViewer/noteInputStore.ts

import { create } from 'zustand'

interface NoteInputState {
  value: string
  set: (value: string) => void
  append: (char: string) => void
  deleteLast: () => void
  deleteWord: () => void
  clear: () => void
}

export const useNoteInputStore = create<NoteInputState>((set) => ({
  value: '',

  set(value) {
    set({ value })
  },

  append(char) {
    set(s => ({ value: s.value + char }))
  },

  deleteLast() {
    set(s => ({ value: s.value.slice(0, -1) }))
  },

  deleteWord() {
    set(s => {
      const trimmed = s.value.trimEnd()
      const lastSpace = trimmed.lastIndexOf(' ')
      return { value: lastSpace === -1 ? '' : trimmed.slice(0, lastSpace) }
    })
  },

  clear() {
    set({ value: '' })
  },
}))
