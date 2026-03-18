// @paladin/project-viewer-frontend/src/lib/store.ts
//
// Zustand store — single source of truth for the project viewer.
// Actions that hit the API are async methods on the store itself.

import { create } from "zustand"
import type {
  RepoData,
  FlatFile,
  GrepFilter,
  Session,
  Preset,
  Tab,
} from "../types"
import * as api from "./api"

const TAB_ORDER: Tab[] = ["viewer", "config", "notepad"]

/** Full application state + actions. */
export type Store = {
  status: "idle" | "loading" | "ready" | "error"
  error?: string

  repo: RepoData | null
  /** files after all filters applied — drives left panel + nav */
  visible: FlatFile[]
  /** index into visible[] for keyboard nav */
  cursor: number

  content: string | null
  contentPath: string | null

  tab: Tab
  /** excluded category names, e.g. "manifest", "test" */
  excluded: Set<string>
  greps: GrepFilter[]
  /** file paths bookmarked with 's' */
  bookmarks: Set<string>
  notes: string

  session: Session | null
  sessions: Session[]
  presets: Preset[]

  grepOpen: boolean
  cmdkOpen: boolean

  // --- actions ---

  /** Clone + walk a repo, then recompute visible files. */
  load: (target: string) => Promise<void>
  /** Recompute visible[] from repo.flat, excluded, and greps. */
  refilter: () => void
  /** Fetch file content for the current cursor position. */
  openCurrent: () => Promise<void>
  /** Fetch file content for an arbitrary path. */
  openFile: (path: string) => Promise<void>

  moveCursor: (delta: number) => void
  cycleTab: () => void
  setTab: (tab: Tab) => void
  toggleExclude: (category: string) => void
  toggleBookmark: () => void
  setNotes: (notes: string) => void

  /** Run a grep pattern against the repo and add it as a filter. */
  addGrep: (pattern: string) => Promise<void>
  removeGrep: (pattern: string) => void

  setGrepOpen: (open: boolean) => void
  setCmdkOpen: (open: boolean) => void

  /** Create a new session with default state. */
  newSession: (name?: string) => Promise<void>
  /** Persist current state to the active session. */
  saveSession: () => Promise<void>
  /** Load an existing session and restore its state. */
  loadSession: (id: string) => Promise<void>
  /** Fetch all sessions for the current repo. */
  fetchSessions: () => Promise<void>

  /** Save current filters as a named preset. */
  savePreset: (name: string) => Promise<void>
  /** Apply a preset's filters to current state. */
  applyPreset: (preset: Preset) => void
  /** Fetch all presets from backend. */
  fetchPresets: () => Promise<void>

  /** Full reset back to idle. */
  reset: () => void
}

export const useStore = create<Store>((set, get) => ({
  status: "idle",
  repo: null,
  visible: [],
  cursor: 0,
  content: null,
  contentPath: null,
  tab: "viewer",
  excluded: new Set(["ignored"]),
  greps: [],
  bookmarks: new Set(),
  notes: "",
  session: null,
  sessions: [],
  presets: [],
  grepOpen: false,
  cmdkOpen: false,

  load: async (target) => {
    set({ status: "loading", error: undefined })
    const repo = await api.loadRepo(target)
    const defaultTab: Tab = repo.flat.length > 100 ? "config" : "viewer"
    set({ repo, status: "ready", tab: defaultTab })
    get().refilter()
  },

  refilter: () => {
    const { repo, excluded, greps } = get()
    if (!repo) return

    let files = repo.flat.filter(f => !excluded.has(f.category))

    // if grep filters exist, only include files that matched at least one
    if (greps.length > 0) {
      const matched = new Set(greps.flatMap(g => g.matches))
      if (matched.size > 0) {
        files = files.filter(f => matched.has(f.path))
      }
    }

    set({ visible: files, cursor: 0, content: null, contentPath: null })
  },

  openCurrent: async () => {
    const { repo, visible, cursor } = get()
    if (!repo || visible.length === 0) return
    const file = visible[cursor]
    if (!file) return
    const res = await api.loadFile(repo.org, repo.name, file.path)
    set({ content: res.content, contentPath: res.path })
  },

  openFile: async (path) => {
    const { repo } = get()
    if (!repo) return
    const res = await api.loadFile(repo.org, repo.name, path)
    set({ content: res.content, contentPath: res.path })
  },

  moveCursor: (delta) => {
    const { visible, cursor } = get()
    if (visible.length === 0) return
    const next = Math.max(0, Math.min(visible.length - 1, cursor + delta))
    set({ cursor: next })
    get().openCurrent()
  },

  cycleTab: () => {
    const { tab } = get()
    const i = TAB_ORDER.indexOf(tab)
    set({ tab: TAB_ORDER[(i + 1) % TAB_ORDER.length] })
  },

  setTab: (tab) => set({ tab }),

  toggleExclude: (category) => {
    const { excluded } = get()
    const next = new Set(excluded)
    if (next.has(category)) next.delete(category)
    else next.add(category)
    set({ excluded: next })
    get().refilter()
  },

  toggleBookmark: () => {
    const { visible, cursor, bookmarks } = get()
    const file = visible[cursor]
    if (!file) return
    const next = new Set(bookmarks)
    if (next.has(file.path)) next.delete(file.path)
    else next.add(file.path)
    set({ bookmarks: next })
  },

  setNotes: (notes) => set({ notes }),

  addGrep: async (pattern) => {
    const { repo, visible, greps } = get()
    if (!repo) return
    const paths = visible.map(f => f.path)
    const result = await api.grepRepo(repo.org, repo.name, pattern, paths)
    set({ greps: [...greps, result] })
    get().refilter()
  },

  removeGrep: (pattern) => {
    const { greps } = get()
    set({ greps: greps.filter(g => g.pattern !== pattern) })
    get().refilter()
  },

  setGrepOpen: (open) => set({ grepOpen: open }),
  setCmdkOpen: (open) => set({ cmdkOpen: open }),

  newSession: async (name) => {
    const { repo } = get()
    if (!repo) return
    const session = await api.createSession({
      name: name || new Date().toISOString(),
      repo: `${repo.org}/${repo.name}`,
      bookmarks: [],
      notes: "",
      excluded: ["ignored"],
      greps: [],
    })
    set({
      session,
      excluded: new Set(["ignored"]),
      greps: [],
      bookmarks: new Set(),
      notes: "",
    })
    get().refilter()
  },

  saveSession: async () => {
    const { session, bookmarks, notes, excluded, greps } = get()
    if (!session) return
    const updated = await api.updateSession(session.id, {
      bookmarks: [...bookmarks],
      notes,
      excluded: [...excluded],
      greps: greps.map(g => g.pattern),
    })
    set({ session: updated })
  },

  loadSession: async (id) => {
    const session = await api.getSession(id)
    set({
      session,
      bookmarks: new Set(session.bookmarks),
      notes: session.notes,
      excluded: new Set(session.excluded),
      greps: [],
    })
    // greps need to be re-run to get match data
    for (const pattern of session.greps) {
      await get().addGrep(pattern)
    }
    get().refilter()
  },

  fetchSessions: async () => {
    const { repo } = get()
    if (!repo) return
    const sessions = await api.listSessions(`${repo.org}/${repo.name}`)
    set({ sessions })
  },

  savePreset: async (name) => {
    const { excluded, greps } = get()
    const preset = await api.createPreset({
      name,
      excluded: [...excluded],
      greps: greps.map(g => g.pattern),
    })
    set({ presets: [...get().presets, preset] })
  },

  applyPreset: (preset) => {
    set({
      excluded: new Set(preset.excluded),
      greps: [],
    })
    // re-run greps from preset
    for (const pattern of preset.greps) {
      get().addGrep(pattern)
    }
  },

  fetchPresets: async () => {
    const presets = await api.listPresets()
    set({ presets })
  },

  reset: () => set({
    status: "idle",
    repo: null,
    visible: [],
    cursor: 0,
    content: null,
    contentPath: null,
    tab: "viewer",
    excluded: new Set(["ignored"]),
    greps: [],
    bookmarks: new Set(),
    notes: "",
    session: null,
    sessions: [],
    grepOpen: false,
    cmdkOpen: false,
  }),
}))
