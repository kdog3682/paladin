// src/components/SessionMonitor/types.ts

export interface ConversationData {
  id: string
  url: string
  title: string
  updatedAt: string
}

export interface ProjectData {
  dir: string
  name: string
}

export interface GitFile {
  path: string
  status: "modified" | "created"
  staged: boolean
}

export interface GitData {
  branch: string
  files: GitFile[]
  commitMessage?: string
}

export interface RunResult {
  name: string
  file: string
  success: boolean
  data: Record<string, unknown>
}

export interface SessionData {
  conversation: ConversationData
  project: ProjectData
  git: GitData
  runResults: RunResult[]
}
