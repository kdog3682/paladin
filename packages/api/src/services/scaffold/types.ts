export interface ScaffoldOptions {
  baseProjectDir: string
  activeDir: string | null
  git: {
    initLocalRepo: boolean
    initRemoteRepository: boolean
  }
}

export type ScaffoldConfig = Partial<Omit<ScaffoldOptions, 'git'>> & { git?: Partial<ScaffoldOptions['git']> }

export interface FileEntry {
  path: string
  relpath: string
  content: string
}

export interface PackageData {
  name: string
  isNew: boolean | null
  files: FileEntry[]
  dir: string
  deps: Record<string, string>
  devDeps: Record<string, string>
}

export interface PreparedProject {
  name: string
  dir: string
  isNew: boolean
  files: FileEntry[]
}

export interface ProjectData {
  name: string
  isNew: boolean | null
  files: FileEntry[]
  dir: string
  packages: PackageData[]
}
