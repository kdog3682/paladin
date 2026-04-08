// src/types/claude.ts

export interface Message {
  sender: string
  content: Block[]
}

export interface Block {
  type?: string
  name?: string
  input?: {
    command?: string
    id?: string
    content?: string
    old_str?: string
    new_str?: string
  }
  stop_timestamp?: string
}

export interface Conversation {
  url: string
  title: string
  updatedAt: string
  messages: Message[]
}

export interface FileEntry {
  path: string
  content: string
}

export interface ProjectInfo {
  name: string
  dir: string
  new: boolean
}

export interface ParseResult {
  files: FileEntry[]
  project: ProjectInfo
}

export interface InstalledDep {
  type: "dep" | "devDep"
  name: string
  version: string
}

export interface PackageData {
  name: string
  dir: string
  new: boolean
  installed: InstalledDep[]
}

export interface ClaudeSessionData {
  project: {
    name: string
    dir: string
    new: boolean
  }
  conversation: {
    id: string
    url: string
    title: string
    updatedAt: string
  }
  files: string[]
  packages: PackageData[]
}
