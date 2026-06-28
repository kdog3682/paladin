import { join, extname } from 'path'
import { existsSync } from 'fs'
import { expandHome } from '../../utils/path'
import { extractHeader } from './prepare'
import { hydrate } from './hydrate'
import { codeRunner } from '../codeRunner'
import { handleGit, logProject } from './shared'
import type { ScaffoldOptions, FileEntry, ScaffoldResult } from './types'

const PROJECTS_BASE = expandHome('~/projects')

function resolveTypstPath(rawPath: string): string {
  if (rawPath.startsWith('/') || rawPath.startsWith('~')) {
    return expandHome(rawPath)
  }
  const segs = rawPath.split('/')
  const projectName = segs[0]
  const rest = segs.slice(1)
  const withSrc = rest[0] === 'src' ? rest : ['src', ...rest]
  return join(PROJECTS_BASE, projectName, ...withSrc)
}

async function readInputs(file: string): Promise<string[]> {
  if (file.endsWith('.zip')) {
    const { unzipSync, strFromU8 } = await import('fflate')
    const buf = new Uint8Array(await Bun.file(file).arrayBuffer())
    const entries = unzipSync(buf)
    return Object.values(entries).map((u8) => strFromU8(u8))
  }
  return [await Bun.file(file).text()]
}

export async function scaffoldTypst(file: string, opts: ScaffoldOptions): Promise<ScaffoldResult | null> {
  const contents = await readInputs(expandHome(file))

  const fileEntries: FileEntry[] = []
  let projectName: string | null = null
  let projectDir: string | null = null

  for (const content of contents) {
    const header = extractHeader(content)
    if (!header || extname(header.rawPath) !== '.typ') continue

    const abs = resolveTypstPath(header.rawPath)
    if (!projectName) {
      projectName = header.rawPath.split('/')[0]
      projectDir = join(PROJECTS_BASE, projectName)
    }
    const relpath = abs.slice(projectDir!.length + 1)
    fileEntries.push({ path: abs, relpath, content: header.body })
  }

  if (!fileEntries.length || !projectName || !projectDir) return null

  const isNew = !existsSync(projectDir)

  const written: FileEntry[] = []
  for (const f of fileEntries) {
    if (existsSync(f.path) && (await Bun.file(f.path).text()) === f.content) continue
    await Bun.write(f.path, f.content)
    written.push(f)
  }

  if (isNew) {
    await hydrate(join(import.meta.dir, 'templates', 'typst.tpl'), projectDir, {
      PROJECT_NAME: projectName,
    })
    await logProject(projectName, 'typst')
  }

  const [codeExecutionResults, gitData] = await Promise.all([
    codeRunner(fileEntries),
    handleGit(projectDir, projectName, isNew, {
      initLocal: opts.git.initLocalRepo,
      initRemote: opts.git.initRemoteRepository,
    }),
  ])

  return { gitData, codeExecutionResults }
}
