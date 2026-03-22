// @paladin/scribe-ui/src/store.ts

import { create } from "zustand"
import type {
  Ticket,
  Template,
  FileGroup,
  FileEntry,
  SubmitMode,
  RightPanelTab,
  TreeNode,
  FileLabel,
  SourceDir,
  GlobalFilters,
} from "./types"
import * as api from "./api"
import { toast } from "sonner"

type ScribeStore = {
  // -- Active ticket --
  ticket: Ticket | null
  isDirty: boolean
  lastSavedAt: number | null

  // -- Editor --
  body: string
  name: string
  templateKey: string | null
  submitMode: SubmitMode
  sourceFiles: string[]

  // -- Templates --
  templates: Template[]
  templateManagerOpen: boolean

  // -- Right panel --
  rightPanelTab: RightPanelTab
  viewerFullscreen: boolean

  // -- File tree --
  treeNodes: TreeNode[]
  selectedTreePath: string | null
  fileContents: Record<string, string>
  recentFiles: string[]
  pinnedFiles: string[]

  // -- File viewer --
  viewerFileIndex: number
  viewerScrollLine: number

  // -- Picker --
  pickerOpen: boolean

  // -- Modals --
  previewOpen: boolean
  ticketPickerOpen: boolean
  fileGroupSaveOpen: boolean
  keybindingHelpOpen: boolean

  // -- Config --
  sourceDirs: SourceDir[]
  globalFilters: GlobalFilters | null
  projectDir: string

  // -- Actions --
  setBody: (body: string) => void
  setName: (name: string) => void
  setTemplateKey: (key: string | null) => void
  setSubmitMode: (mode: SubmitMode) => void
  setRightPanelTab: (tab: RightPanelTab) => void
  toggleRightPanel: () => void
  setViewerFullscreen: (v: boolean) => void
  setSelectedTreePath: (path: string | null) => void
  setViewerFileIndex: (i: number) => void
  setViewerScrollLine: (line: number) => void
  setPickerOpen: (open: boolean) => void
  setPreviewOpen: (open: boolean) => void
  setTicketPickerOpen: (open: boolean) => void
  setFileGroupSaveOpen: (open: boolean) => void
  setKeybindingHelpOpen: (open: boolean) => void
  setTemplateManagerOpen: (open: boolean) => void

  // -- Data actions --
  init: () => Promise<void>
  loadTemplates: () => Promise<void>
  loadRecentFiles: () => Promise<void>
  loadSourceDirs: () => Promise<void>
  loadGlobalFilters: () => Promise<void>

  // -- Ticket actions --
  newTicket: () => void
  loadTicket: (id: string) => Promise<void>
  saveTicket: () => Promise<void>
  duplicateTicket: () => Promise<void>

  // -- File tree actions --
  addFilesToTree: (entries: FileEntry[], label?: FileLabel) => void
  removeFromTree: (path: string) => void
  toggleBookmark: (path: string) => void
  bookmarkAll: (path: string) => void
  unbookmarkAll: (path: string) => void
  readFile: (path: string) => Promise<string>

  // -- Pinning --
  togglePin: (path: string) => void
}

function mergeIntoTree(existing: TreeNode[], entries: FileEntry[], label?: FileLabel): TreeNode[] {
  const merged = [...existing]

  for (const entry of entries) {
    const idx = merged.findIndex((n) => n.path === entry.path)
    if (idx >= 0) {
      if (entry.type === "directory" && entry.children) {
        merged[idx] = {
          ...merged[idx],
          children: mergeIntoTree(merged[idx].children, entry.children, label),
        }
      }
    } else {
      merged.push(entryToNode(entry, label))
    }
  }

  return merged
}

function entryToNode(entry: FileEntry, label?: FileLabel): TreeNode {
  return {
    path: entry.path,
    name: entry.name,
    type: entry.type,
    bookmarked: false,
    label,
    children:
      entry.type === "directory" && entry.children
        ? entry.children.map((c) => entryToNode(c, label))
        : [],
  }
}

function collectFiles(node: TreeNode): string[] {
  if (node.type === "file") return [node.path]
  return node.children.flatMap(collectFiles)
}

function setBookmarkRecursive(nodes: TreeNode[], path: string, value: boolean): TreeNode[] {
  return nodes.map((n) => {
    if (n.path === path) {
      if (n.type === "directory") {
        return {
          ...n,
          bookmarked: value,
          children: n.children.map((c) => setAllBookmarks(c, value)),
        }
      }
      return { ...n, bookmarked: value }
    }
    return { ...n, children: setBookmarkRecursive(n.children, path, value) }
  })
}

function setAllBookmarks(node: TreeNode, value: boolean): TreeNode {
  return {
    ...node,
    bookmarked: node.type === "file" ? value : node.bookmarked,
    children: node.children.map((c) => setAllBookmarks(c, value)),
  }
}

function collectBookmarkedFiles(nodes: TreeNode[]): string[] {
  const result: string[] = []
  for (const n of nodes) {
    if (n.type === "file" && n.bookmarked) result.push(n.path)
    result.push(...collectBookmarkedFiles(n.children))
  }
  return result
}

function removeNodeByPath(nodes: TreeNode[], path: string): TreeNode[] {
  return nodes
    .filter((n) => n.path !== path)
    .map((n) => ({ ...n, children: removeNodeByPath(n.children, path) }))
}

export const useStore = create<ScribeStore>((set, get) => ({
  ticket: null,
  isDirty: false,
  lastSavedAt: null,
  body: "",
  name: "Untitled",
  templateKey: null,
  submitMode: "clipboard",
  sourceFiles: [],
  templates: [],
  templateManagerOpen: false,
  rightPanelTab: "tree",
  viewerFullscreen: false,
  treeNodes: [],
  selectedTreePath: null,
  fileContents: {},
  recentFiles: [],
  pinnedFiles: [],
  viewerFileIndex: 0,
  viewerScrollLine: 0,
  pickerOpen: false,
  previewOpen: false,
  ticketPickerOpen: false,
  fileGroupSaveOpen: false,
  keybindingHelpOpen: false,
  sourceDirs: [],
  globalFilters: null,
  projectDir: "",

  setBody: (body) => set({ body, isDirty: true }),
  setName: (name) => set({ name, isDirty: true }),
  setTemplateKey: (templateKey) => set({ templateKey }),
  setSubmitMode: (submitMode) => set({ submitMode }),
  setRightPanelTab: (rightPanelTab) => set({ rightPanelTab }),
  toggleRightPanel: () =>
    set((s) => ({ rightPanelTab: s.rightPanelTab === "tree" ? "viewer" : "tree" })),
  setViewerFullscreen: (viewerFullscreen) => set({ viewerFullscreen }),
  setSelectedTreePath: (selectedTreePath) => set({ selectedTreePath }),
  setViewerFileIndex: (viewerFileIndex) => set({ viewerFileIndex, viewerScrollLine: 0 }),
  setViewerScrollLine: (viewerScrollLine) => set({ viewerScrollLine }),
  setPickerOpen: (pickerOpen) => set({ pickerOpen }),
  setPreviewOpen: (previewOpen) => set({ previewOpen }),
  setTicketPickerOpen: (ticketPickerOpen) => set({ ticketPickerOpen }),
  setFileGroupSaveOpen: (fileGroupSaveOpen) => set({ fileGroupSaveOpen }),
  setKeybindingHelpOpen: (keybindingHelpOpen) => set({ keybindingHelpOpen }),
  setTemplateManagerOpen: (templateManagerOpen) => set({ templateManagerOpen }),

  init: async () => {
    try {
      const [{ projectDir }, { recentFiles }] = await Promise.all([
        api.state.projectDir.get(),
        api.state.recentFiles.get(),
      ])
      set({ projectDir, recentFiles })

      const dirs = await api.config.sourceDirs.list()
      if (dirs.length === 0 && projectDir) {
        const created = await api.config.sourceDirs.create({ path: projectDir })
        set({ sourceDirs: [created] })
      } else {
        set({ sourceDirs: dirs })
      }

      const filters = await api.config.globalFilters.get()
      set({ globalFilters: filters })

      await get().loadTemplates()

      if (recentFiles.length > 0) {
        const entries: FileEntry[] = recentFiles.map((f) => ({
          path: f,
          name: f.split("/").pop() || f,
          type: "file" as const,
        }))
        get().addFilesToTree(entries, "recent")
      }
    } catch (err) {
      console.error("Init failed:", err)
      toast.error("Failed to initialize", {
        description: err instanceof Error ? err.message : "Check that the backend is running on :4800",
      })
    }
  },

  loadTemplates: async () => {
    const templates = await api.templates.list()
    set({ templates })
  },

  loadRecentFiles: async () => {
    const { recentFiles } = await api.state.recentFiles.get()
    set({ recentFiles })
    if (recentFiles.length > 0) {
      const entries: FileEntry[] = recentFiles.map((f) => ({
        path: f,
        name: f.split("/").pop() || f,
        type: "file" as const,
      }))
      get().addFilesToTree(entries, "recent")
    }
  },

  loadSourceDirs: async () => {
    const sourceDirs = await api.config.sourceDirs.list()
    set({ sourceDirs })
  },

  loadGlobalFilters: async () => {
    const globalFilters = await api.config.globalFilters.get()
    set({ globalFilters })
  },

  newTicket: () =>
    set({
      ticket: null,
      body: "",
      name: "Untitled",
      templateKey: null,
      sourceFiles: [],
      isDirty: false,
      lastSavedAt: null,
      treeNodes: [],
      viewerFileIndex: 0,
      viewerScrollLine: 0,
    }),

  loadTicket: async (id) => {
    const ticket = await api.tickets.get(id)
    const entries: FileEntry[] = ticket.sourceFiles.map((f) => ({
      path: f,
      name: f.split("/").pop() || f,
      type: "file" as const,
    }))
    const treeNodes = mergeIntoTree([], entries)
    // Auto-bookmark all loaded source files
    let marked = treeNodes
    for (const f of ticket.sourceFiles) {
      marked = setBookmarkRecursive(marked, f, true)
    }
    set({
      ticket,
      body: ticket.body,
      name: ticket.name,
      templateKey: ticket.templateKey,
      sourceFiles: ticket.sourceFiles,
      treeNodes: marked,
      isDirty: false,
      lastSavedAt: Date.now(),
    })
  },

  saveTicket: async () => {
    const { ticket, body, name, templateKey, sourceFiles } = get()
    const bookmarked = collectBookmarkedFiles(get().treeNodes)
    const sf = [...new Set([...sourceFiles, ...bookmarked])]

    try {
      if (ticket) {
        const updated = await api.tickets.update(ticket.id, {
          body,
          name,
          templateKey,
          sourceFiles: sf,
        })
        set({ ticket: updated, sourceFiles: sf, isDirty: false, lastSavedAt: Date.now() })
        toast.success("Saved")
      } else {
        const created = await api.tickets.create({
          body,
          name,
          templateKey,
          sourceFiles: sf,
        })
        set({ ticket: created, sourceFiles: sf, isDirty: false, lastSavedAt: Date.now() })
        toast.success("Ticket created")
      }
    } catch (err) {
      toast.error("Failed to save", {
        description: err instanceof Error ? err.message : "Unknown error",
      })
    }
  },

  duplicateTicket: async () => {
    const { ticket } = get()
    if (!ticket) return
    try {
      const dup = await api.tickets.duplicate(ticket.id)
      await get().loadTicket(dup.id)
      toast.success("Ticket duplicated")
    } catch (err) {
      toast.error("Failed to duplicate", {
        description: err instanceof Error ? err.message : "Unknown error",
      })
    }
  },

  addFilesToTree: (entries, label) =>
    set((s) => ({
      treeNodes: mergeIntoTree(s.treeNodes, entries, label),
    })),

  removeFromTree: (path) =>
    set((s) => ({
      treeNodes: removeNodeByPath(s.treeNodes, path),
      sourceFiles: s.sourceFiles.filter((f) => !f.startsWith(path)),
      isDirty: true,
    })),

  toggleBookmark: (path) =>
    set((s) => {
      const find = (nodes: TreeNode[]): TreeNode | undefined => {
        for (const n of nodes) {
          if (n.path === path) return n
          const found = find(n.children)
          if (found) return found
        }
      }
      const node = find(s.treeNodes)
      if (!node) return s
      const newVal = !node.bookmarked
      const treeNodes = setBookmarkRecursive(s.treeNodes, path, newVal)
      return { treeNodes, sourceFiles: collectBookmarkedFiles(treeNodes), isDirty: true }
    }),

  bookmarkAll: (path) =>
    set((s) => {
      const treeNodes = setBookmarkRecursive(s.treeNodes, path, true)
      return { treeNodes, sourceFiles: collectBookmarkedFiles(treeNodes), isDirty: true }
    }),

  unbookmarkAll: (path) =>
    set((s) => {
      const treeNodes = setBookmarkRecursive(s.treeNodes, path, false)
      return { treeNodes, sourceFiles: collectBookmarkedFiles(treeNodes), isDirty: true }
    }),

  readFile: async (path) => {
    const cached = get().fileContents[path]
    if (cached) return cached
    const { content } = await api.files.read(path)
    set((s) => ({ fileContents: { ...s.fileContents, [path]: content } }))
    return content
  },

  togglePin: (path) =>
    set((s) => {
      const pinned = s.pinnedFiles.includes(path)
        ? s.pinnedFiles.filter((p) => p !== path)
        : [...s.pinnedFiles, path]
      // Update label on tree nodes
      const updateLabel = (nodes: TreeNode[]): TreeNode[] =>
        nodes.map((n) => ({
          ...n,
          label: n.path === path ? (pinned.includes(path) ? "pinned" : n.label === "pinned" ? undefined : n.label) : n.label,
          children: updateLabel(n.children),
        }))
      return { pinnedFiles: pinned, treeNodes: updateLabel(s.treeNodes) }
    }),
}))
