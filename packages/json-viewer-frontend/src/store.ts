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
  defaultFile: string | null

  fetchFiles: () => Promise<void>
  selectFile: (file: JsonFileEntry) => Promise<void>
  openFzf: () => Promise<void>
  closeFzf: () => void
  toggleTheme: () => void
  saveAsDefault: () => void
}

export const useStore = create<JsonViewerStore>((set, get) => ({
  files: [],
  selectedFile: null,
  jsonData: null,
  fzfOpen: false,
  loading: false,
  theme: lightTheme,
  themeName: "light",
  defaultFile: null,

  fetchFiles: async () => {
    const res = await fetch(`${API}/files`)
    const files: JsonFileEntry[] = await res.json()
    const defaultPath = localStorage.getItem("json-viewer:default")
    set({ files, defaultFile: defaultPath })

    if (!get().selectedFile && files.length > 0) {
      const defaultFile = defaultPath
        ? files.find((f) => f.path === defaultPath)
        : null
      await get().selectFile(defaultFile || files[files.length - 1])
    }
  },

  selectFile: async (file) => {
    set({ selectedFile: file, loading: true, fzfOpen: false })
    const res = await fetch(`${API}/json?file=${encodeURIComponent(file.path)}`)
    const { data } = await res.json()
    set({ jsonData: data, loading: false })
  },

  openFzf: async () => {
    // fetch fresh list every time
    const res = await fetch(`${API}/files`)
    const files: JsonFileEntry[] = await res.json()
    set({ files, fzfOpen: true })
  },

  closeFzf: () => set({ fzfOpen: false }),

  toggleTheme: () =>
    set((s) => ({
      themeName: s.themeName === "light" ? "dark" : "light",
      theme: s.themeName === "light" ? darkTheme : lightTheme,
    })),

  saveAsDefault: () => {
    const file = get().selectedFile
    if (!file) return
    localStorage.setItem("json-viewer:default", file.path)
    set({ defaultFile: file.path })
  },
}))
