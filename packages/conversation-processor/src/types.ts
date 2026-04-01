// @paladin/conversation-processor/types.ts

import type { BashResult } from "@paladin/utils/bash"

// ── Incoming ────────────────────────────────────────────────

export type ConversationData = {
  id: string
  title: string
  url: string
  updatedAt: string
  artifacts: {
    updatedAt: string
    content: string
  }[]
}

// ── Parsed ──────────────────────────────────────────────────

export type ParsedImport = {
  specifier: string
  kind: "external" | "workspace" | "relative"
  version?: string
}

export type IncomingFile = {
  path: string
  relativePath: string
  content: string
  imports: ParsedImport[]
  status: "created" | "modified"
  action: "write" | "delete" | "append"
}

export type { HeaderResult, HeaderAction } from "./utils/extract-header.types"

// ── Package ─────────────────────────────────────────────────

export type PkgContext = {
  name: string
  dir: string
  isNew: boolean
  packageJson: Record<string, unknown>
  incomingFiles: IncomingFile[]
}

// ── Pipeline ────────────────────────────────────────────────

export type PipelineContext = {
  workspaceRoot: string
  workspacePackages: Set<string>
  packages: Map<string, PkgContext>
}

// ── Processors ──────────────────────────────────────────────

export type FileOp =
  | { kind: "write"; path: string; content: string }
  | { kind: "write-json"; path: string; data: Record<string, unknown> }
  | { kind: "patch-json"; path: string; merge: Record<string, unknown>; reason: "deps" | "exports" | "config" }
  | { kind: "delete"; path: string }
  | { kind: "append"; path: string; content: string }
  | { kind: "run"; cmd: string; cwd: string }

export type Processor = {
  name: string
  run(pkg: PkgContext, pipeline: PipelineContext): FileOp[]
}

// ── Project (output for frontend) ───────────────────────────

export type ConversationRef = {
  id: string
  url: string
  title: string
  updatedAt: string
}

export type ProjectFile = {
  path: string
  status: "created" | "modified"
}

export type ProjectData = {
  name: string
  rootDir: string
  conversationRefs: ConversationRef[]
  isNew: boolean
  files: ProjectFile[]
  bashResults: BashResult[]
  handlerResults: Record<string, unknown[]>
}

// ── Watch Registry ──────────────────────────────────────────

export type WatchEntry = {
  testPath: string
  deps: string[]
  process?: { kill(): void }
}
