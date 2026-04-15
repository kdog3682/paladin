// src/types.ts

export type FileSourceType = 'git' | 'directory' | 'filegroup'

export type FileSource = {
  name: string
  type: FileSourceType
  files: string[]
}

export type TicketFile = {
  path: string
  notes: string[]
}

export type Ticket = {
  name: string
  keywords: string[]
  fileSourceType: FileSourceType
  fileSourceName: string
  files: TicketFile[]
  createdAt: string
  updatedAt: string
}

export type TicketRow = {
  name: string
  keywords: string
  file_source_type: FileSourceType
  file_source_name: string
  created_at: string
  updated_at: string
}

export type TicketFileRow = {
  ticket_name: string
  path: string
  notes: string
}

export type GitFileStatus = 'modified' | 'created'

export type GitFile = {
  path: string
  status: GitFileStatus
  staged: boolean
}

export type GitData = {
  files: GitFile[]
  branch: string
}

export type GitLogEntry = {
  hash: string
  message: string
  date: string
  author: string
}

export type BashResult = {
  stdout: string
  stderr: string
  exitCode: number
  cmds: string[]
}

export type Filegroup = {
  name: string
  paths: string[]
  createdAt: string
  updatedAt: string
}

export type FilegroupRow = {
  name: string
  paths: string
  created_at: string
  updated_at: string
}

export type DirEntry = {
  name: string
  path: string
  isDirectory: boolean
}
