// @paladin/packages/api/src/services/filewatch/types.ts

export interface FileEntry {
  content: string
  path: string
}

export interface Package {
  projectName: string
  packageName: string
  dir: string
  files: FileEntry[]
  isNew: boolean
}

export interface Conversation {
  id: string
  url: string
  title: string
  updatedAt: string
  messages: unknown[]
}

export interface SessionInfo {
  projectName: string
  projectDir: string
  conversation: {
    id: string
    url: string
    title: string
    updatedAt: string
  }
  files: string[]
}
