import { existsSync } from 'fs'
import { join } from 'path'
import { expandHome } from '../utils/path'
import { prepareTypescript, prepareTypst } from './scaffold'
import { extractHeader } from './scaffold/prepare'
import { codeRunner } from './codeRunner'
import { handleGit, logProject } from './scaffold/shared'
import type { ScaffoldOptions } from './scaffold/types'
import type { GitData } from './git'
import type { BashResult } from '../utils/bash'

export interface ScaffoldResult {
  gitData: GitData | null
  codeExecutionResults: BashResult[]
}

export interface ProcessFileResult {
  event: 'fileProcessor:scaffold'
  data: ScaffoldResult
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

export async function readInputs(file: string): Promise<string[]> {
  const expanded = expandHome(file)
  if (expanded.endsWith('.zip')) {
    const { unzipSync, strFromU8 } = await import('fflate')
    const buf = new Uint8Array(await Bun.file(expanded).arrayBuffer())
    const entries = unzipSync(buf)
    return Object.values(entries).map((u8) => strFromU8(u8))
  }
  return [await Bun.file(expanded).text()]
}

export function detectLanguage(contents: string[]): 'typescript' | 'typst' {
  for (const content of contents) {
    const header = extractHeader(content)
    if (header) return header.rawPath.endsWith('.typ') ? 'typst' : 'typescript'
  }
  return 'typescript'
}

export async function processFile(file: string): Promise<ProcessFileResult | null> {
  const opts = await resolveOptions()
  const contents = await readInputs(file)
  const lang = detectLanguage(contents)

  const prepared = lang === 'typst'
    ? await prepareTypst(contents, opts)
    : await prepareTypescript(contents, opts)

  if (!prepared) return null

  if (prepared.isNew) await logProject(prepared.name, lang)

  const [codeExecutionResults, gitData] = await Promise.all([
    codeRunner(prepared.files),
    handleGit(prepared.dir, prepared.name, prepared.isNew, {
      initLocal: opts.git.initLocalRepo,
      initRemote: opts.git.initRemoteRepository,
    }),
  ])

  return { event: 'fileProcessor:scaffold', data: { gitData, codeExecutionResults } }
}
