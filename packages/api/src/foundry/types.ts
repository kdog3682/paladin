// Core foundry state model. FileNodeInternal carries hashes (backend-only);
// FileNode is the wire projection sent to the frontend. Run results live
// outside the tree, keyed by cacheKey.

export type Kind = 'source' | 'demo' | 'script' | 'config' | 'test'
export type GitStatus = 'created' | 'modified' | 'clean'

export interface Git {
  status: GitStatus
  staged: boolean
}

// Backend-internal node. contentHash is the authoritative change signal;
// cacheKey keys the run-result store (runnable kinds only). Neither crosses
// the wire.
export interface FileNodeInternal {
  path: string
  displayName: string
  kind: Kind
  isNew: boolean
  contentHash: string
  cacheKey?: string
  git: Git
  modifiedAt: number
}

// Wire shape. No hashes — the frontend decides everything it needs from
// git.status + hasResult, so hashes stay server-side and off the socket.
export interface FileNode {
  path: string
  displayName: string
  kind: Kind
  isNew: boolean
  git: Git
  hasResult: boolean
  modifiedAt: number
}

export interface PackageData {
  path: string
  displayName: string
  isNew: boolean
  files: FileNodeInternal[]
}

export interface ProjectData {
  name: string // raw project name (baseline/store key); not sent to the wire
  path: string
  displayName: string
  isNew: boolean
  files: FileNodeInternal[]
  packages: PackageData[]
}

export type Output =
  | { type: 'image'; url: string }
  | { type: 'pdf'; url: string }
  | { type: 'text'; text: string }

// What the code-execution backend returns.
export interface CodeExecutionResult {
  exitCode: number
  stdout: string
  stderr: string
  args: string[]
  output?: Output
}

// Stored result: the execution outcome plus cache metadata. Lives outside the
// tree, keyed by FileNodeInternal.cacheKey. An edit-and-revert returns the key
// to its old value and re-hits the cached result — output URL included.
export interface RunResult extends CodeExecutionResult {
  ranAt: number
  durationMs: number
}

const RUNNABLE: ReadonlySet<Kind> = new Set<Kind>(['demo', 'script', 'test'])
export const isRunnable = (kind: Kind): boolean => RUNNABLE.has(kind)

// Projects an internal node to its wire shape, dropping hashes. hasResult is
// supplied by the caller from the result store (results.has(node.cacheKey)).
export function toWire(node: FileNodeInternal, hasResult: boolean): FileNode {
  return {
    path: node.path,
    displayName: node.displayName,
    kind: node.kind,
    isNew: node.isNew,
    git: node.git,
    hasResult,
    modifiedAt: node.modifiedAt,
  }
}

// Wire tree — what the frontend receives. Same shape as ProjectData with nodes
// projected to FileNode.
export interface WirePackage {
  path: string
  displayName: string
  isNew: boolean
  files: FileNode[]
}

export interface WireProject {
  path: string
  displayName: string
  isNew: boolean
  files: FileNode[]
  packages: WirePackage[]
}

export function toWireTree(
  project: ProjectData,
  hasResult: (node: FileNodeInternal) => boolean,
): WireProject {
  const wire = (n: FileNodeInternal): FileNode => toWire(n, hasResult(n))
  return {
    path: project.path,
    displayName: project.displayName,
    isNew: project.isNew,
    files: project.files.map(wire),
    packages: project.packages.map((p) => ({
      path: p.path,
      displayName: p.displayName,
      isNew: p.isNew,
      files: p.files.map(wire),
    })),
  }
}
