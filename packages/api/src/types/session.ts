// src/types/session.ts

import type { ConversationData } from "./claude"
import type { RunResult } from "../services/runcode/types"
import type { GitFile } from "../services/git"

export interface ProjectData {
  dir: string
  name: string
}

export interface GitData {
  branch: string
  files: GitFile[]
  commitMessage?: string
}

export interface SessionData {
  conversation: ConversationData
  project: ProjectData
  git: GitData
  runResults: RunResult[]
}
