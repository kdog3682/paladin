// @paladin/types/src/file.ts

export interface FileInfo {
  loc: number
  fullPath: string
  createdAt: string | null
  modifiedAt: string | null
}

export interface FileHistoryEntry {
  hash: string
  message: string
  date: string
  author: string
}
