// @paladin/packages/analyze-v2/graph.types.ts

export type FileNode = {
  path: string
  /** Resolved paths this file imports */
  imports: string[]
  /** Resolved paths of files that import this file */
  importedBy: string[]
}

export type ProjectGraph = {
  root: string
  files: Map<string, FileNode>
}
