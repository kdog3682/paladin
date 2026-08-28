import type { ResolveScopedPathOptions } from '@paladin/utils'

export type ScaffoldOptions = ResolveScopedPathOptions & {
  npmCachePath?: string
}

export type FileStatus = 'created' | 'modified' | 'unchanged' | 'deprecated'

export type FileAction = 'write' | 'append' | 'delete' | 'skip'

export interface File {
  path: string
  status: FileStatus
  action: FileAction
  content: string
}

export interface Unit {
  name: string
  dir: string
  isNew: boolean
  files: File[]
}

export interface Project {
  name: string
  dir: string
  isNew: boolean
  units: Unit[]
}

export interface PostProcessResult {
  name: string
  paths: string[]
}
