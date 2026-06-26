export interface ScaffoldOptions {
  baseProjectDir: string
  activeDir: string | null
  git?: boolean
  remote?: boolean
}

export interface FileEntry {
  path: string
  relpath: string
  content: string
}

export interface ScaffoldError {
  type: 'pathResolution' | 'bunInit'
  message: string
  data?: unknown
}

export interface PackageData {
  name: string
  isNew: boolean | null
  files: FileEntry[]
  dir: string
}

export interface ProjectData {
  name: string
  isNew: boolean | null
  files: FileEntry[]
  dir: string
  packages: PackageData[]
  error?: ScaffoldError
}
