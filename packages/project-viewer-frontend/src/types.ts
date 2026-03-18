// @paladin/project-viewer-frontend/src/types.ts

/**
 * Nested tree node from the backend walk — used by the canvas file tree
 * on the left panel. Dirs have children, files have size.
 */
export type FileNode = {
  path: string
  name: string
  type: "file" | "dir"
  children?: FileNode[]
  size?: number
}

/**
 * Flattened file entry from walk — one per file, no nesting.
 * Used for filtering, counting, and keyboard navigation (up/down).
 */
export type FlatFile = {
  path: string
  name: string
  category: FileCategory
  size: number
}

/**
 * Category buckets assigned by the backend based on filename/path patterns.
 * - "ignored": LICENSE, .prettierrc, images, locks, etc (hidden by default)
 * - "manifest": package.json, tsconfig, vite.config, etc
 * - "test": *.test.*, *.spec.*, __tests__/
 * - "config": dotfiles, *.config.ts/js
 * - "source": everything else
 */
export type FileCategory = "ignored" | "manifest" | "test" | "config" | "source"

/**
 * Response from POST /repo/load — contains both the nested tree
 * (for rendering) and the flat list (for filtering/nav).
 */
export type RepoData = {
  org: string
  name: string
  sub?: string
  root: string
  tree: FileNode[]
  flat: FlatFile[]
  total: number
  categories: Record<string, number>
}

/**
 * Result of a grep inclusion filter. If effective is false,
 * the pattern matched nothing and shows red in the UI.
 */
export type GrepFilter = {
  pattern: string
  matches: string[]
  effective: boolean
}

/**
 * Persisted session saved to the backend as JSON. Captures the full
 * working state: active filters, bookmarked files, and notepad content.
 * Name defaults to an ISO timestamp but can be renamed by the user.
 */
export type Session = {
  id: string
  name: string
  repo: string
  created: string
  updated: string
  bookmarks: string[]
  notes: string
  excluded: string[]
  greps: string[]
  preset?: string
}

/**
 * Reusable filter config decoupled from session data.
 * Can be loaded into any session via the config tab.
 */
export type Preset = {
  id: string
  name: string
  excluded: string[]
  greps: string[]
}

/**
 * Right panel tabs, cycled with the Tab key.
 * - "viewer": file content display
 * - "config": filter categories, grep list, preset management
 * - "notepad": freeform notes with autosave
 */
export type Tab = "viewer" | "config" | "notepad"
