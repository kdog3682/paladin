// @paladin/scaffold-v3/scaffold/types.ts

import type { BashResult } from "@paladin/utils/bash"

// --- input ---

export interface FileContent {
  content: string
  id?: string
  updatedAt?: string
}

// --- imports ---

export interface ImportEntry {
  specifier: string
  package: string
  subpath: string | null
  kind: "workspace" | "external"
}

// --- resolved files ---

export interface ResolvedFile {
  absolutePath: string
  relativePath: string
  content: string
  packageName: string | null
  packageDir: string | null
  isNew: boolean
  imports: ImportEntry[]
}

// --- subpath export edits ---

export interface ExportEdit {
  packageName: string
  packageDir: string
  subpath: string
  target: string
}

// --- output ---

export interface FileResult {
  isNew: boolean
  relativePath: string
}

export interface PackageResult {
  isNew: boolean
  packageDir: string
  packageName: string
  newDependenciesInstalled: string[]
  files: FileResult[]
}

export interface ProjectData {
  isNew: boolean
  projectDir: string
  projectName: string
  files: string[]
  packages: PackageResult[]
  exportEdits: ExportEdit[]
  errors: BashResult[]
}
