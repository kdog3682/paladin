// @paladin/scaffold-v2/types.ts

import type { BashResult } from "@paladin/utils/bash"

// --- imports ---

export interface ImportTable {
  workspace: string[]
  external: string[]
}

// --- input ---

export interface FileContent {
  content: string
  id?: string
}

// --- resolved files ---

export interface ResolvedFile {
  absolutePath: string
  relativePath: string
  content: string
  packageName: string | null
  packageDir: string | null
  isNew: boolean
  importTable: ImportTable
}

// --- content transforms (pre-processing) ---

export interface ContentTransform {
  matches: RegExp
  replacements: { search: string | RegExp, replace: string }[]
}

// --- package matchers ---

export interface PackageContext {
  isNew: boolean
  projectName: string
  projectDir: string
  packageName: string
  packageDir: string
  files: ResolvedFile[]
}

export interface MatcherResult {
  matched: boolean
  terminal?: boolean
  filesCreated?: string[]
  commands?: { cmd: string[], cwd: string }[]
}

export type Matcher = (pkg: PackageContext) => Promise<MatcherResult>

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
  errors: BashResult[]
}
