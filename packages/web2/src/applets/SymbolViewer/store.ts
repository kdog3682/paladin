import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"
import { ancestors, isWithin } from "./lib/paths"

type SymbolFlags = Record<string, Record<string, boolean>>

export type FocusPane = "tree" | "cards"

export type WorkspaceState = {
  /* absolute path of the loaded package. restored on refresh; the most recent package is only used on a first ever load */
  root: string | null
  /* absolute path of the open file */
  currentFile: string | null
  /* last opened file per package root */
  lastFile: Record<string, string>
  /* expanded dirs, keyed by absolute path */
  expanded: Record<string, true>
  /* keyboard cursor in the file tree, as an absolute path */
  cursor: string | null
  /* explicit hide overrides, file -> symbol -> hidden. absent means the default (hidden when not exported) */
  hidden: SymbolFlags
  /* flipped cards, file -> symbol -> flipped */
  flipped: SymbolFlags
  /* render hidden cards (dimmed) so they can be unhidden */
  showHidden: boolean
  /* selected symbol in the content panel */
  selected: string | null
  /* symbol to scroll to once the file's symbols load. transient */
  scrollTarget: string | null
  /* card panel scrollTop per file */
  scroll: Record<string, number>
  /* file tree scrollTop per package root */
  treeScroll: Record<string, number>
  /* pane that last had keyboard focus, refocused on refresh */
  focus: FocusPane | null
  /* left sidebar open */
  sidebarOpen: boolean

  setRoot: (root: string) => void
  openFile: (file: string, symbol?: string | null) => void
  select: (name: string | null) => void
  clearScrollTarget: () => void
  setCursor: (path: string | null) => void
  setExpanded: (path: string, open: boolean) => void
  toggleExpanded: (path: string) => void
  isHidden: (file: string, name: string, exported: boolean) => boolean
  toggleHidden: (file: string, name: string, exported: boolean) => void
  toggleFlip: (file: string, name: string) => void
  toggleShowHidden: () => void
  setScroll: (bucket: "scroll" | "treeScroll", key: string, top: number) => void
  setFocus: (pane: FocusPane) => void
  setSidebarOpen: (open: boolean) => void
  movePath: (from: string, to: string) => void
  removePath: (path: string) => void
  renameSymbol: (file: string, name: string, newName: string) => void
}

/* rewrites every key under `from` to live under `to`. null drops them */
function remapKeys<T>(rec: Record<string, T>, from: string, to: string | null): Record<string, T> {
  const out: Record<string, T> = {}
  for (const [k, v] of Object.entries(rec)) {
    if (!isWithin(from, k)) out[k] = v
    else if (to !== null) out[to + k.slice(from.length)] = v
  }
  return out
}

function remapValues(rec: Record<string, string>, from: string, to: string | null): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(rec)) {
    if (!isWithin(from, v)) out[k] = v
    else if (to !== null) out[k] = to + v.slice(from.length)
  }
  return out
}

const remapPath = (p: string | null, from: string, to: string | null) =>
  p && isWithin(from, p) ? (to === null ? null : to + p.slice(from.length)) : p

function setFlag(flags: SymbolFlags, file: string, name: string, value: boolean): SymbolFlags {
  return { ...flags, [file]: { ...flags[file], [name]: value } }
}

function renameFlag(flags: SymbolFlags, file: string, name: string, newName: string): SymbolFlags {
  const forFile = flags[file]
  if (!forFile || !(name in forFile)) return flags
  const { [name]: value, ...rest } = forFile
  return { ...flags, [file]: { ...rest, [newName]: value } }
}

export const useWorkspace = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      root: null,
      currentFile: null,
      lastFile: {},
      expanded: {},
      cursor: null,
      hidden: {},
      flipped: {},
      showHidden: false,
      selected: null,
      scrollTarget: null,
      scroll: {},
      treeScroll: {},
      focus: null,
      sidebarOpen: true,

      setRoot: (root) =>
        set((s) =>
          s.root === root
            ? {}
            : { root, currentFile: s.lastFile[root] ?? null, cursor: s.lastFile[root] ?? null, selected: null, scrollTarget: null },
        ),

      openFile: (file, symbol = null) =>
        set((s) => {
          const expanded = { ...s.expanded }
          if (s.root) for (const dir of ancestors(s.root, file)) expanded[dir] = true
          return {
            currentFile: file,
            cursor: file,
            lastFile: s.root ? { ...s.lastFile, [s.root]: file } : s.lastFile,
            expanded,
            selected: symbol,
            scrollTarget: symbol,
          }
        }),

      select: (selected) => set({ selected }),
      clearScrollTarget: () => set({ scrollTarget: null }),
      setCursor: (cursor) => set({ cursor }),

      setExpanded: (path, open) =>
        set((s) => {
          const expanded = { ...s.expanded }
          if (open) expanded[path] = true
          else delete expanded[path]
          return { expanded }
        }),

      toggleExpanded: (path) => get().setExpanded(path, !get().expanded[path]),

      isHidden: (file, name, exported) => get().hidden[file]?.[name] ?? !exported,

      toggleHidden: (file, name, exported) =>
        set((s) => ({ hidden: setFlag(s.hidden, file, name, !get().isHidden(file, name, exported)) })),

      toggleFlip: (file, name) =>
        set((s) => ({ flipped: setFlag(s.flipped, file, name, !s.flipped[file]?.[name]) })),

      toggleShowHidden: () => set((s) => ({ showHidden: !s.showHidden })),

      setScroll: (bucket, key, top) =>
        set((s) => (s[bucket][key] === top ? {} : { [bucket]: { ...s[bucket], [key]: top } })),

      setFocus: (focus) => set((s) => (s.focus === focus ? {} : { focus })),
      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),

      movePath: (from, to) =>
        set((s) => ({
          expanded: remapKeys(s.expanded, from, to),
          hidden: remapKeys(s.hidden, from, to),
          flipped: remapKeys(s.flipped, from, to),
          scroll: remapKeys(s.scroll, from, to),
          lastFile: remapValues(s.lastFile, from, to),
          currentFile: remapPath(s.currentFile, from, to),
          cursor: remapPath(s.cursor, from, to),
        })),

      removePath: (path) =>
        set((s) => {
          const currentFile = remapPath(s.currentFile, path, null)
          return {
            expanded: remapKeys(s.expanded, path, null),
            hidden: remapKeys(s.hidden, path, null),
            flipped: remapKeys(s.flipped, path, null),
            scroll: remapKeys(s.scroll, path, null),
            lastFile: remapValues(s.lastFile, path, null),
            currentFile,
            cursor: remapPath(s.cursor, path, null),
            selected: currentFile ? s.selected : null,
          }
        }),

      renameSymbol: (file, name, newName) =>
        set((s) => ({
          hidden: renameFlag(s.hidden, file, name, newName),
          flipped: renameFlag(s.flipped, file, name, newName),
          selected: s.currentFile === file && s.selected === name ? newName : s.selected,
        })),
    }),
    {
      name: "workspace.json",
      storage: createJSONStorage(() => localStorage),
      /* everything except the one-shot scroll target */
      partialize: ({ scrollTarget, ...s }) =>
        Object.fromEntries(Object.entries(s).filter(([, v]) => typeof v !== "function")) as Partial<WorkspaceState>,
    },
  ),
)
