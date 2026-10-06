/*
 * in-memory stand-ins for the dependencies in deps.ts.
 * replace each with the real module as it lands; see the spec changelog.
 */
import { fuzzyFilter, isMac, sleep } from "@paladin/ui"
import type {
  FocusRegion,
  KeybindingApi,
  PaladinDeps,
  ProjectSummary,
  SessionSummary,
  SymbolHit,
} from "./deps"

const log = (...args: unknown[]) => console.info("[palette stub]", ...args)

/* matches combos like "mod+k" or "mod+shift+o" */
export function matchesCombo(combo: string, e: KeyboardEvent) {
  const parts = combo.toLowerCase().split("+")
  const key = parts.pop()
  const mod = parts.includes("mod")
  const wantMeta = parts.includes("meta") || (mod && isMac())
  const wantCtrl = parts.includes("ctrl") || (mod && !isMac())
  return (
    e.key.toLowerCase() === key &&
    e.metaKey === wantMeta &&
    e.ctrlKey === wantCtrl &&
    e.shiftKey === parts.includes("shift") &&
    e.altKey === parts.includes("alt")
  )
}

const SHORTCUTS: Record<string, string> = {
  "session.new": "⌘⇧O",
}

export function createStubKeybindings(): KeybindingApi {
  return {
    bind(combo, handler) {
      const listener = (e: KeyboardEvent) => {
        if (matchesCombo(combo, e)) handler(e)
      }
      window.addEventListener("keydown", listener)
      return () => window.removeEventListener("keydown", listener)
    },
    shortcutFor: (id) => SHORTCUTS[id],
  }
}

const HOUR = 3600_000

export const STUB_PROJECTS: ProjectSummary[] = [
  { id: "p1", name: "paladin", root: "/home/kdog3682/projects/paladin", status: "active", touchedAt: Date.now() - HOUR },
  { id: "p2", name: "mathpen", root: "/home/kdog3682/projects/mathpen", status: "active", touchedAt: Date.now() - 5 * HOUR },
  { id: "p3", name: "dotfiles", root: "/home/kdog3682/dotfiles", status: "suspended", touchedAt: Date.now() - 50 * HOUR },
  { id: "p4", name: "old-blog", root: "/home/kdog3682/projects/old-blog", status: "archived", touchedAt: Date.now() - 900 * HOUR },
]

export const STUB_SESSIONS: SessionSummary[] = [
  { id: "s1", projectId: "p1", name: "command palette", updatedAt: Date.now() - 10 * 60_000 },
  { id: "s2", projectId: "p1", name: "ticket bundle", updatedAt: Date.now() - 3 * HOUR },
  { id: "s3", projectId: "p1", name: "instruction resolver", updatedAt: Date.now() - 30 * HOUR },
  { id: "s4", projectId: "p2", name: "manim scenes", updatedAt: Date.now() - 2 * HOUR },
]

export const STUB_FILES = [
  "/home/kdog3682/projects/paladin/packages/ui/src/command-palette/store.ts",
  "/home/kdog3682/projects/paladin/packages/ui/src/command-palette/keys.ts",
  "/home/kdog3682/projects/paladin/packages/web/src/core/palette/palette.ts",
  "/home/kdog3682/projects/paladin/packages/web/src/core/palette/PaletteHost.tsx",
  "/home/kdog3682/projects/paladin/packages/utils/src/path/toScopedPath.ts",
  "/home/kdog3682/projects/paladin/packages/web/src/App.tsx",
]

export const STUB_SYMBOLS: SymbolHit[] = [
  { name: "createPaletteStore", kind: "function", path: STUB_FILES[0], line: 92 },
  { name: "resolveKey", kind: "function", path: STUB_FILES[1], line: 58 },
  { name: "createPaladinPalette", kind: "function", path: STUB_FILES[2], line: 14 },
  { name: "PaletteHost", kind: "component", path: STUB_FILES[3], line: 14 },
]

export function createStubDeps(overrides: Partial<PaladinDeps> = {}): PaladinDeps {
  let region: FocusRegion = "editor"
  let current = { projectId: "p1", sessionId: "s1" }
  const sessions = [...STUB_SESSIONS]
  const projects = [...STUB_PROJECTS]
  let files = [...STUB_FILES]

  const deps: PaladinDeps = {
    focus: {
      current: () => region,
      focus: (next) => {
        region = next
        log("focus", next)
      },
    },
    keybindings: createStubKeybindings(),
    panel: {
      openView: (view, props) => log("openView", view, props),
      toggle: () => log("panel.toggle"),
      toggleExpanded: () => log("panel.toggleExpanded"),
    },
    sidebar: {
      toggle: () => log("sidebar.toggle"),
    },
    workspace: {
      current: () => current,
      switchSession: async (sessionId) => {
        const session = sessions.find((s) => s.id === sessionId)
        if (session) current = { projectId: session.projectId, sessionId }
        log("switchSession", sessionId)
      },
      newSession: async (projectId) => {
        const session = { id: `s${sessions.length + 1}`, projectId, name: "untitled", updatedAt: Date.now() }
        sessions.push(session)
        current = { projectId, sessionId: session.id }
        log("newSession", session)
      },
      openProject: async (projectId) => {
        const latest = sessions
          .filter((s) => s.projectId === projectId)
          .sort((a, b) => b.updatedAt - a.updatedAt)[0]
        current = { projectId, sessionId: latest?.id ?? "" }
        log("openProject", projectId)
      },
      listSessions: async (projectId, signal) => {
        await sleep(40, signal)
        return sessions.filter((s) => s.projectId === projectId)
      },
      listProjects: async (signal) => {
        await sleep(40, signal)
        return projects
      },
      setProjectStatus: async (projectId, status) => {
        const project = projects.find((p) => p.id === projectId)
        if (project) project.status = status
        log("setProjectStatus", projectId, status)
      },
    },
    search: {
      files: async (query, signal) => {
        await sleep(80, signal)
        return fuzzyFilter(query, files, (f) => f).map(({ item, score }) => ({ path: item, score }))
      },
      symbols: async (query, signal) => {
        await sleep(120, signal)
        return fuzzyFilter(query, STUB_SYMBOLS, (s) => s.name).map(({ item, score }) => ({ ...item, score }))
      },
      completePath: async (partial, signal) => {
        await sleep(30, signal)
        return fuzzyFilter(partial, files, (f) => f).slice(0, 8).map((x) => x.item)
      },
    },
    fs: {
      rename: async (from, to) => {
        if (!files.includes(from)) throw new Error(`No such file: ${from}`)
        files = files.map((f) => (f === from ? to : f))
        log("rename", from, to)
      },
    },
  }

  return { ...deps, ...overrides }
}
