// @paladin/scaffold-v2/scaffold/matchers/types.ts

import type { ResolvedFile } from "../types"

export interface PackageContext {
  isNew: boolean
  projectName: string
  projectDir: string
  packageName: string
  packageDir: string
  files: ResolvedFile[]
}

export interface CreatedFile {
  absolutePath: string
  content: string
}

export interface MatcherResult {
  matched: boolean
  terminal?: boolean
  filesCreated?: CreatedFile[]
  commands?: { cmd: string[]; cwd: string }[]
}

export type Matcher = (pkg: PackageContext) => Promise<MatcherResult>
