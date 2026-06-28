import { join, extname } from 'path'
import { existsSync } from 'fs'
import { expandHome } from '../../utils/path'
import { extractHeader } from './prepare'
import { hydrate } from './hydrate'
import { syncFiles } from './shared'
import type { ScaffoldOptions, FileEntry, PreparedProject } from './types'

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

export async function prepareTypst(contents: string[], opts: ScaffoldOptions): Promise<PreparedProject | null> {
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

  const written = await syncFiles(fileEntries)

  if (isNew) {
    await hydrate(join(import.meta.dir, 'templates', 'typst.tpl'), projectDir, {
      PROJECT_NAME: projectName,
    })
  }

  return {
    name: projectName,
    dir: projectDir,
    isNew,
    files: written,
  }
}
