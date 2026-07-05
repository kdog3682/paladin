import { create } from 'zustand'

const uuid = () => crypto.randomUUID()
const MAX = 10

export interface Tab {
  id: string
  title: string
  used: number
}

/** Serialized CodeMirror EditorState (doc + selection + foldState) plus scroll. */
export interface CmSnapshot {
  json: unknown
  scrollTop: number
}

export interface HydratePayload {
  docs: { id: string; title: string; cm: unknown; scrollTop: number }[]
  tabs: string[]
  activeId: string
}

interface AppState {
  // current doc mirror (see ctx.doc())
  docId: string
  docTitle: string

  tabs: Tab[]
  activeId: string
  snapshots: Record<string, CmSnapshot>
  dirty: string[]

  panelOpen: boolean
  panelFocused: boolean
  renamingId: string | null
  hydrated: boolean

  setDocMeta: (m: { docId: string; docTitle: string }) => void
  hydrate: (p: HydratePayload) => void
  newTab: () => void
  closeTab: (id: string) => void
  activate: (id: string) => void
  cycleTab: (dir: 1 | -1) => void
  startRename: (id: string) => void
  commitRename: (id: string, title: string) => void
  cancelRename: () => void
  setSnapshot: (id: string, snap: CmSnapshot) => void
  clearDirty: (ids: string[]) => void
  setPanelOpen: (v: boolean) => void
  setPanelFocused: (v: boolean) => void
}

const markDirty = (dirty: string[], id: string) =>
  dirty.includes(id) ? dirty : [...dirty, id]

export const useAppStore = create<AppState>((set, get) => ({
  docId: '',
  docTitle: '',
  tabs: [],
  activeId: '',
  snapshots: {},
  dirty: [],
  panelOpen: false,
  panelFocused: false,
  renamingId: null,
  hydrated: false,

  setDocMeta: ({ docId, docTitle }) => set({ docId, docTitle }),

  hydrate: (p) => {
    const byId = new Map(p.docs.map((d) => [d.id, d]))
    const snapshots: Record<string, CmSnapshot> = {}
    for (const d of p.docs) snapshots[d.id] = { json: d.cm, scrollTop: d.scrollTop ?? 0 }

    let tabs: Tab[] = p.tabs
      .filter((id) => byId.has(id))
      .map((id, i) => ({ id, title: byId.get(id)!.title, used: i }))
    let activeId = p.activeId && byId.has(p.activeId) ? p.activeId : tabs[0]?.id ?? ''

    if (tabs.length === 0) {
      const id = uuid()
      tabs = [{ id, title: 'untitled', used: Date.now() }]
      snapshots[id] = { json: null, scrollTop: 0 }
      activeId = id
    }

    const active = tabs.find((t) => t.id === activeId)!
    set({
      tabs,
      activeId,
      snapshots,
      hydrated: true,
      docId: activeId,
      docTitle: active.title,
    })
  },

  newTab: () => {
    const id = uuid()
    let tabs: Tab[] = [{ id, title: 'untitled', used: Date.now() }, ...get().tabs]
    if (tabs.length > MAX) {
      const victim = tabs.slice(1).reduce((m, t) => (t.used < m.used ? t : m))
      tabs = tabs.filter((t) => t.id !== victim.id)
    }
    set((s) => ({
      tabs,
      activeId: id,
      renamingId: id,
      panelOpen: true,
      panelFocused: true,
      snapshots: { ...s.snapshots, [id]: { json: null, scrollTop: 0 } },
      dirty: markDirty(s.dirty, id),
      docId: id,
      docTitle: 'untitled',
    }))
  },

  closeTab: (id) => {
    const { tabs, activeId, renamingId } = get()
    const idx = tabs.findIndex((t) => t.id === id)
    if (idx === -1) return
    const next = tabs.filter((t) => t.id !== id)
    if (next.length === 0) {
      get().newTab()
      return
    }
    let active = activeId
    if (activeId === id) active = next[Math.max(0, idx - 1)]?.id ?? next[0].id
    const at = next.find((t) => t.id === active)!
    set({
      tabs: next,
      activeId: active,
      docId: active,
      docTitle: at.title,
      renamingId: renamingId === id ? null : renamingId,
    })
  },

  activate: (id) => {
    const t = get().tabs.find((x) => x.id === id)
    if (!t) return
    set((s) => ({
      activeId: id,
      docId: id,
      docTitle: t.title,
      panelFocused: false,
      renamingId: null,
      tabs: s.tabs.map((x) => (x.id === id ? { ...x, used: Date.now() } : x)),
    }))
  },

  cycleTab: (dir) => {
    const { tabs, activeId } = get()
    if (tabs.length < 2) return
    const i = tabs.findIndex((t) => t.id === activeId)
    const n = (i + dir + tabs.length) % tabs.length
    set({ panelOpen: true })
    get().activate(tabs[n].id)
  },

  startRename: (id) => set({ renamingId: id, panelOpen: true, panelFocused: true }),

  commitRename: (id, title) =>
    set((s) => {
      const clean = title.trim() || 'untitled'
      return {
        tabs: s.tabs.map((t) => (t.id === id ? { ...t, title: clean } : t)),
        renamingId: null,
        panelFocused: false,
        docTitle: s.activeId === id ? clean : s.docTitle,
        dirty: markDirty(s.dirty, id),
      }
    }),

  cancelRename: () => set({ renamingId: null, panelFocused: false }),

  setSnapshot: (id, snap) =>
    set((s) => ({
      snapshots: { ...s.snapshots, [id]: snap },
      dirty: markDirty(s.dirty, id),
    })),

  clearDirty: (ids) => set((s) => ({ dirty: s.dirty.filter((d) => !ids.includes(d)) })),

  setPanelOpen: (v) => set({ panelOpen: v }),
  setPanelFocused: (v) => set({ panelFocused: v }),
}))
