// src/components/FileViewer/store.ts

import { create } from 'zustand'

export interface FileEntry {
  path: string
  notes: string[]
  marked: boolean
}

interface FileViewerState {
  source: string
  files: FileEntry[]
  currentIndex: number
  diffActive: boolean

  // computed
  currentFile: () => FileEntry | undefined

  // actions
  setFiles: (files: FileEntry[]) => void
  setSource: (source: string) => void
  setIndex: (index: number) => void
  nextFile: () => void
  prevFile: () => void
  toggleDiff: () => void
  toggleMark: () => void
  addNote: (note: string) => void
}

export const useFileViewerStore = create<FileViewerState>((set, get) => ({
  source: 'git',
  files: [
    { path: 'packages/web/src/components/Table/Table.tsx', notes: [], marked: false },
    { path: 'packages/web/src/lib/utils.ts', notes: [], marked: false },
    { path: 'packages/web/src/hooks/useDebounce.ts', notes: [], marked: false },
  ],
  currentIndex: 0,
  diffActive: false,

  currentFile() {
    const { files, currentIndex } = get()
    return files[currentIndex]
  },

  setFiles(files) {
    set({ files, currentIndex: 0 })
  },

  setSource(source) {
    set({ source })
  },

  setIndex(index) {
    const { files } = get()
    if (index >= 0 && index < files.length) {
      set({ currentIndex: index })
    }
  },

  nextFile() {
    const { currentIndex, files } = get()
    if (currentIndex < files.length - 1) {
      set({ currentIndex: currentIndex + 1 })
    }
  },

  prevFile() {
    const { currentIndex } = get()
    if (currentIndex > 0) {
      set({ currentIndex: currentIndex - 1 })
    }
  },

  toggleDiff() {
    set(s => ({ diffActive: !s.diffActive }))
  },

  toggleMark() {
    set(s => {
      const files = [...s.files]
      const file = { ...files[s.currentIndex] }
      file.marked = !file.marked
      files[s.currentIndex] = file
      return { files }
    })
  },

  addNote(note) {
    set(s => {
      const files = [...s.files]
      const file = { ...files[s.currentIndex] }
      file.notes = [...file.notes, note]
      file.marked = true
      files[s.currentIndex] = file
      return { files }
    })
  },
}))
