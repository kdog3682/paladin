// @paladin/scribe-ui/src/types.ts

export type TicketStatus = "active" | "archived" | "suspended" | "completed"

export type Ticket = {
  id: string
  name: string
  body: string
  templateKey: string | null
  status: TicketStatus
  tags: string[]
  sourceFiles: string[]
  createdAt: string
  modifiedAt: string
}

export type Template = {
  key: string
  name: string
  content: string
  createdAt: string
  modifiedAt: string
}

export type FileGroup = {
  id: string
  name: string
  files: string[]
  createdAt: string
}

export type FileEntry = {
  path: string
  name: string
  type: "file" | "directory"
  children?: FileEntry[]
}

export type ScoredResult = {
  item: FileEntry | FileGroup
  score: number
  kind: "group" | "package" | "directory" | "file"
}

export type SourceDir = {
  id: string
  path: string
  include: string | null
  exclude: string | null
  visible: boolean
}

export type GlobalFilters = {
  id: "singleton"
  include: string
  exclude: string
}

export type SubmitMode = "clipboard" | "preview" | "task"

export type RightPanelTab = "tree" | "viewer"

export type FileLabel = "recent" | "pinned" | "picked"

export type TreeNode = {
  path: string
  name: string
  type: "file" | "directory"
  children: TreeNode[]
  bookmarked: boolean
  label?: FileLabel
}
