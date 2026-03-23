// @paladin/json-viewer-frontend/src/store.ts

import { create } from "zustand"
import { lightTheme, darkTheme, type JsonTheme } from "./theme"

const API = "http://localhost:4888"

interface JsonFileEntry {
  name: string
  path: string
  mtime: number
}

interface JsonViewerStore {
  files: JsonFileEntry[]
  selectedFile: JsonFileEntry | null
  jsonData: unknown | null
  fzfOpen: boolean
  loading: boolean
  theme: JsonTheme
  themeName: "light" | "dark"

  fetchFiles: () => Promise<void>
  selectFile: (file: JsonFileEntry) => Promise<void>
  toggleFzf: () => void
  closeFzf: () => void
  toggleTheme: () => void
}

export const useStore = create<JsonViewerStore>((set, get) => ({
  files: [],
  selectedFile: null,
  jsonData: null,
  fzfOpen: false,
  loading: false,
  theme: lightTheme,
  themeName: "light",

  fetchFiles: async () => {
    const res = await fetch(`${API}/files`)
    const files: JsonFileEntry[] = await res.json()
    set({ files })

    if (!get().selectedFile && files.length > 0) {
      await get().selectFile(files[files.length - 1])
    }
  },

  selectFile: async (file) => {
    set({ selectedFile: file, loading: true, fzfOpen: false })
    const res = await fetch(`${API}/json?file=${encodeURIComponent(file.path)}`)
    const { data } = await res.json()
    set({ jsonData: data, loading: false })
  },

  toggleFzf: () => set((s) => ({ fzfOpen: !s.fzfOpen })),
  closeFzf: () => set({ fzfOpen: false }),

  toggleTheme: () =>
    set((s) => ({
      themeName: s.themeName === "light" ? "dark" : "light",
      theme: s.themeName === "light" ? darkTheme : lightTheme,
    })),
}))
