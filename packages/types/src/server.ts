// @paladin/types/src/server.ts

import type { Artifact, RunResult } from "./artifact"
import type { FileInfo, FileHistoryEntry } from "./file"
import type { GitStatusEntry } from "./git"

export type ServerMessage =
  | { type: "artifactsModified"; artifacts: Artifact[] }
  | { type: "filesWritten"; artifacts: Artifact[]; paths: string[] }
  | { type: "runResult"; artifactId: string; result: RunResult }
  | { type: "commitCreated"; output: string }
  | { type: "commitStarted"; files: string[] }
  | { type: "fileInfo"; artifactId: string; info: FileInfo }
  | { type: "fileHistory"; artifactId: string; history: FileHistoryEntry[] }
  | { type: "projectList"; projects: string[] }
  | { type: "fileMoved"; artifactId: string; newPath: string; aliasedPath: string }
  | { type: "gitStatus"; entries: GitStatusEntry[] }
  | { type: "staged"; files: string[] }
  | { type: "unstaged"; files: string[] }
  | { type: "depsInstalled"; packages: Record<string, string[]> }
  | { type: "projectScaffolded"; projectDir: string; org: string; filesCreated: string[] }

export type ClientMessage =
  | { type: "setProject"; project: string }
  | { type: "getProjects" }
  | { type: "renameFile"; id: string; newPath: string }
  | { type: "commitFile"; id: string }
  | { type: "commitFiles"; files: string[] }
  | { type: "discardFile"; id: string }
  | { type: "stageFile"; file: string }
  | { type: "stageFiles"; files: string[] }
  | { type: "unstageFile"; file: string }
  | { type: "unstageAll" }
  | { type: "getFileInfo"; id: string }
  | { type: "getFileHistory"; id: string }
  | { type: "getGitStatus" }
  | { type: "setModel"; model: string }
  | { type: "setProjectType"; projectType: string }
