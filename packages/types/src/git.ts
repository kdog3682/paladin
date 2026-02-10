// @paladin/types/src/git.ts

export type GitFileStatus = "modified" | "untracked" | "staged"

export interface GitStatusEntry {
  path: string
  relativePath: string
  status: GitFileStatus
}
