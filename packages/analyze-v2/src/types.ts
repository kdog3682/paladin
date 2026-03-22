// @paladin/packages/analyze-v2/types.ts

// ─── Re-export base symbol types ───
export type {
  Param,
  SymbolKind,
  BaseDoc,
  FunctionDoc,
  MethodDoc,
  ClassDoc,
  TypeDoc,
  ConstDoc,
  SymbolDoc,
  ImportRef,
  FileDoc,
} from "./parse-file.types"

import type { SymbolDoc, ImportRef } from "./parse-file.types"

// ─── Short Form ───

/** A 1-line signature with optional docstring, suitable for collapsed view */
export type ShortForm = {
  /** e.g. `async fn multiply(x: num, y: num): P<num>` */
  signature: string
  /** First line of JSDoc if present */
  docstring?: string
}

// ─── Chunks ───

export type ChunkKind =
  | "imports"    // combined imports + re-exports
  | "type"       // type | interface | enum
  | "const"      // const | variable
  | "function"
  | "class"
  | "call"       // top-level expressions, IIFE, if-main blocks

/**
 * A viewable section of the file.
 * The imports chunk is always first; remaining chunks are grouped
 * by kind in the order: types → consts → functions → classes → calls.
 */
export type Chunk = {
  id: string
  kind: ChunkKind
  /** Display label — symbol name, or "Imports" for the imports chunk */
  label: string
  /** The symbol doc (null for imports and call chunks) */
  symbol?: SymbolDoc
  /** Collapsed representation */
  shortForm: ShortForm
  /** Original source text, preserving formatting */
  longForm: string
  /** 0-indexed line range in the original file [start, end) */
  lineRange: [number, number]
}

// ─── File Analysis Result ───

export type ImportEdge = {
  /** The resolved path of the imported file */
  path: string
  /** Symbols imported from that file */
  symbols: string[]
}

export type FileAnalysis = {
  /** Relative path from project root */
  path: string
  /** File-level docstring if present (top-of-file JSDoc) */
  description?: string
  /** Raw imports */
  imports: ImportRef[]
  /** Resolved import edges (for the graph) */
  resolvedImports: ImportEdge[]
  /** Ordered chunks ready for the viewer */
  chunks: Chunk[]
}

// ─── Project Graph ───

export type FileNode = {
  path: string
  /** Files this file imports */
  imports: string[]
  /** Files that import this file */
  importedBy: string[]
}

export type ProjectGraph = {
  root: string
  files: Map<string, FileNode>
}

// ─── Cache ───

export type CacheEntry = {
  /** Hash of file contents (e.g. xxhash or sha256) */
  hash: string
  /** The cached analysis */
  analysis: FileAnalysis
}

export type CacheStore = {
  get(path: string): Promise<CacheEntry | null>
  set(path: string, entry: CacheEntry): Promise<void>
  delete(path: string): Promise<void>
  clear(): Promise<void>
}

// ─── API Surface ───

export type AnalyzeFileOpts = {
  /** Absolute or relative file path */
  path: string
  /** Source code (if already read) — avoids a redundant fs read */
  source?: string
  /** All known project paths, for resolving relative imports */
  projectPaths?: string[]
}

export type AnalyzeProjectOpts = {
  /** Project root directory */
  root: string
  /** Glob patterns to include (default: ["**/*.ts", "**/*.tsx"]) */
  include?: string[]
  /** Glob patterns to exclude (default: ["node_modules/**", "dist/**"]) */
  exclude?: string[]
}
