// src/components/FileViewer/store.ts

import { create } from 'zustand'

// ─── Types ───────────────────────────────────────────────────────────

export interface FileEntry {
  path: string
  notes: string[]
  marked: boolean
}

export interface FileSource {
  name: string
  type: 'git' | 'directory' | 'filegroup'
  files: string[]
}

interface FileViewerState {
  source: FileSource
  files: FileEntry[]
  currentIndex: number
  diffActive: boolean
  noteMode: boolean
  noteValue: string

  // computed
  currentFile: () => FileEntry | undefined

  // actions
  setSource: (source: FileSource) => void
  setIndex: (index: number) => void
  setIndexByPath: (path: string) => void
  nextFile: () => void
  prevFile: () => void
  toggleDiff: () => void
  toggleMark: () => void
  addNote: (note: string) => void
  clearNotes: () => void
  setNoteMode: (on: boolean) => void
  setNoteValue: (value: string) => void
  appendToNote: (char: string) => void
  deleteFromNote: () => void
  deleteWordFromNote: () => void
}

// ─── Helpers ─────────────────────────────────────────────────────────

const BASE = '/home/kdog3682/projects/paladin/packages'

function dummyPath(pkg: string, ...rest: string[]): string {
  return `${BASE}/${pkg}/${rest.join('/')}`
}

const MOCK_SOURCE: FileSource = {
  name: 'modified & new',
  type: 'git',
  files: [
    dummyPath('utils', 'src', 'dash.ts'),
    dummyPath('ai', 'src', 'deepseek.ts'),
    dummyPath('ai', 'src', 'abc', 'def', 'ghi.ts'),
    dummyPath('web', 'src', 'components', 'Table', 'Table.tsx'),
    dummyPath('web', 'src', 'components', 'FileViewer', 'FileViewer.tsx'),
    dummyPath('web', 'src', 'hooks', 'useDebounce.ts'),
    dummyPath('web', 'src', 'lib', 'keybindings.ts'),
    dummyPath('web', 'src', 'stores', 'appletStore.ts'),
    dummyPath('api', 'src', 'routes', 'files.ts'),
    dummyPath('api', 'src', 'services', 'git.ts'),
  ],
}

function toFileEntries(paths: string[]): FileEntry[] {
  return paths.map(p => ({ path: p, notes: [], marked: false }))
}

// ─── Store ───────────────────────────────────────────────────────────

export const useFileViewerStore = create<FileViewerState>((set, get) => ({
  source: MOCK_SOURCE,
  files: toFileEntries(MOCK_SOURCE.files),
  currentIndex: 0,
  diffActive: false,
  noteMode: false,
  noteValue: '',

  currentFile() {
    const { files, currentIndex } = get()
    return files[currentIndex]
  },

  setSource(source) {
    set({
      source,
      files: toFileEntries(source.files),
      currentIndex: 0,
      noteMode: false,
      noteValue: '',
    })
  },

  setIndex(index) {
    const { files } = get()
    if (index >= 0 && index < files.length) {
      set({ currentIndex: index })
    }
  },

  setIndexByPath(path) {
    const { files } = get()
    const idx = files.findIndex(f => f.path === path)
    if (idx !== -1) set({ currentIndex: idx })
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
      return { files, noteValue: '', noteMode: false }
    })
  },

  clearNotes() {
    set(s => {
      const files = s.files.map(f => ({ ...f, notes: [], marked: false }))
      return { files }
    })
  },

  setNoteMode(on) {
    set({ noteMode: on, noteValue: on ? get().noteValue : '' })
  },

  setNoteValue(value) {
    set({ noteValue: value, noteMode: value.length > 0 })
  },

  appendToNote(char) {
    set(s => {
      const noteValue = s.noteValue + char
      return { noteValue, noteMode: true }
    })
  },

  deleteFromNote() {
    set(s => {
      const noteValue = s.noteValue.slice(0, -1)
      return { noteValue, noteMode: noteValue.length > 0 }
    })
  },

  deleteWordFromNote() {
    set(s => {
      const trimmed = s.noteValue.trimEnd()
      const lastSpace = trimmed.lastIndexOf(' ')
      const noteValue = lastSpace === -1 ? '' : trimmed.slice(0, lastSpace)
      return { noteValue, noteMode: noteValue.length > 0 }
    })
  },
}))
