/*
 * thin interfaces for the modules the palette depends on.
 * the real keybinding registry, focus region manager, panel store and
 * backend search aren't built yet; stubs.ts implements these until they are.
 */

export type FocusRegion = "editor" | "chat" | "panel" | "sidebar" | "overlay"

export type FocusApi = {
  /* region that currently owns focus */
  current: () => FocusRegion
  focus: (region: FocusRegion) => void
}

export type KeybindingApi = {
  /* binds a global combo such as "mod+k"; returns a disposer */
  bind: (combo: string, handler: (e: KeyboardEvent) => void) => () => void
  /* display label of the binding attached to a command id */
  shortcutFor: (commandId: string) => string | undefined
}

export type PanelViewId =
  | "file-tree"
  | "file"
  | "assets"
  | "run-result"
  | "ticket"
  | "notes"
  | "project-manager"
  | "skill-output"

export type PanelApi = {
  openView: (view: PanelViewId, props?: Record<string, unknown>) => void
  toggle: () => void
  toggleExpanded: () => void
}

export type SidebarApi = {
  toggle: () => void
}

export type ProjectStatus = "active" | "suspended" | "archived"

export type SessionSummary = {
  id: string
  projectId: string
  name: string
  /* epoch ms */
  updatedAt: number
}

export type ProjectSummary = {
  id: string
  name: string
  root: string
  status: ProjectStatus
  /* epoch ms */
  touchedAt: number
}

export type FileHit = {
  path: string
  score?: number
}

export type SymbolHit = {
  name: string
  kind: string
  path: string
  line: number
  score?: number
}

export type WorkspaceApi = {
  current: () => { projectId: string; sessionId: string }
  switchSession: (sessionId: string) => Promise<void>
  newSession: (projectId: string) => Promise<void>
  /* opens the project's most recent session */
  openProject: (projectId: string) => Promise<void>
  listSessions: (projectId: string, signal?: AbortSignal) => Promise<SessionSummary[]>
  listProjects: (signal?: AbortSignal) => Promise<ProjectSummary[]>
  setProjectStatus: (projectId: string, status: ProjectStatus) => Promise<void>
}

export type SearchApi = {
  files: (query: string, signal: AbortSignal) => Promise<FileHit[]>
  symbols: (query: string, signal: AbortSignal) => Promise<SymbolHit[]>
  /* path completions for a partial path */
  completePath: (partial: string, signal?: AbortSignal) => Promise<string[]>
}

export type FsApi = {
  rename: (from: string, to: string) => Promise<void>
}

export type PaladinDeps = {
  focus: FocusApi
  keybindings: KeybindingApi
  panel: PanelApi
  sidebar: SidebarApi
  workspace: WorkspaceApi
  search: SearchApi
  fs: FsApi
}
