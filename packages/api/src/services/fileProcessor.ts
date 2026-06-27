import { existsSync } from 'fs'
import { join } from 'path'
import { expandHome } from '../utils/path'
import { scaffold } from './scaffold'
import { codeRunner } from './codeRunner'
import * as git from './git'
import type { ScaffoldOptions, ProjectData } from './scaffold/types'
import type { BashResult } from '../utils/bash'
import type { GitFile } from './git'

export interface GitData {
  branch: string
  files: GitFile[]
}

export interface ProcessFileResult {
  event: 'fileProcessor:scaffold'
  data: {
    projectData: ProjectData
    gitData: GitData
    codeExecutionResults: BashResult[]
  }
}

const ACTIVE_DIR_FILE = expandHome('~/activeDir.txt')

let config: ScaffoldOptions = {
  baseProjectDir: '~/projects',
  activeDir: null,
  git: {
    initLocalRepo: true,
    initRemoteRepository: true,
  },
}

type ScaffoldConfig = Partial<Omit<ScaffoldOptions, 'git'>> & { git?: Partial<ScaffoldOptions['git']> }

export function setOptions(opts: ScaffoldConfig): void {
  config = {
    ...config,
    ...opts,
    git: { ...config.git, ...opts.git },
  }
}

export function getOptions(): ScaffoldOptions {
  return config
}

function expandActiveDir(raw: string, base: string): string {
  if (raw.startsWith('@')) {
    const segs = raw.slice(1).split('/')
    const scope = segs[0]
    const name = segs.slice(1).join('/')
    return join(expandHome(base), scope, 'packages', name)
  }
  return expandHome(raw)
}

async function resolveOptions(): Promise<ScaffoldOptions> {
  if (config.activeDir !== null) {
    return { ...config, activeDir: expandActiveDir(config.activeDir, config.baseProjectDir) }
  }
  if (existsSync(ACTIVE_DIR_FILE)) {
    const raw = (await Bun.file(ACTIVE_DIR_FILE).text()).trim()
    if (raw) {
      return { ...config, activeDir: expandActiveDir(raw, config.baseProjectDir) }
    }
  }
  return config
}

export async function processFile(file: string): Promise<ProcessFileResult | null> {
  const opts = await resolveOptions()
  const project = await scaffold(file, opts)
  if (!project) return null

  const files = [...project.files, ...project.packages.flatMap((p) => p.files)]
  const [codeExecutionResults, gitResult] = await Promise.all([
    codeRunner(files),
    git.getData(),
  ])

  return {
    event: 'fileProcessor:scaffold' as const,
    data: { projectData: project, gitData: { branch: gitResult.branch, files: gitResult.files }, codeExecutionResults },
  }
}
