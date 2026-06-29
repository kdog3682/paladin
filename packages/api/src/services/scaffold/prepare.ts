import { join, relative, isAbsolute, basename, dirname } from 'path'
import { expandHome } from '../../utils/path'
import type { ScaffoldOptions, ProjectData, PackageData, FileEntry } from './types'

const SRC_DIRS = ['src', 'docs', 'scripts']
const COMMENT_RE = /^\s*(?:\/\/|#)\s*(.+?)\s*$/
const EXT_RE = /\.[a-z0-9]+$/i

function firstSeg(p: string): string {
  return p.split('/')[0]
}

export function extractHeader(content: string): { rawPath: string; body: string } | null {
  if (content.trim() === '') return null

  const lines = content.split('\n')
  if (lines.slice(0, 3).join('\n').toLowerCase().includes('deprecated')) return null

  let commentIdx = 0
  if (lines[0] !== undefined && lines[0].startsWith('#!')) commentIdx = 1

  const line = lines[commentIdx]
  if (line === undefined) return null

  const match = line.match(COMMENT_RE)
  if (!match) return null

  const rawPath = match[1].trim()
  if (!rawPath || !EXT_RE.test(rawPath)) return null

  const body = lines
    .filter((_, i) => i !== commentIdx)
    .join('\n')
    .replace(/^\n+/, '')

  return { rawPath, body }
}

function resolvePath(rawPath: string, opts: ScaffoldOptions): string | null {
  const base = expandHome(opts.baseProjectDir)

  if (rawPath.startsWith('/') || rawPath.startsWith('~')) {
    return expandHome(rawPath)
  }
  if (rawPath.startsWith('paladin')) {
    rawPath = '@' + rawPath
  }
  if (rawPath.startsWith('@')) {
    const segs = rawPath.slice(1).split('/')
    const scope = segs[0]
    const rest = segs.slice(1)

    if (rest[0] === 'packages') {
      const pkg = rest[1]
      const tail = rest.slice(2).join('/')
      const withSrc = SRC_DIRS.includes(firstSeg(tail)) ? tail : join('src', tail)
      return join(base, scope, 'packages', pkg, withSrc)
    }

    const pkg = rest[0]
  const tail = rest.slice(1).join('/')
  if (tail) {
    const withSrc = SRC_DIRS.includes(firstSeg(tail)) ? tail : join('src', tail)
    return join(base, scope, 'packages', pkg, withSrc)
  }
  return join(base, scope, 'packages', pkg)
  }

  const isBasename = !rawPath.includes('/')
  const isDotRel = rawPath.startsWith('./') || rawPath.startsWith('../')
  if (isBasename || isDotRel || SRC_DIRS.includes(firstSeg(rawPath))) {
    if (!opts.activeDir) throw new Error(`scaffold: cannot resolve relative path "${rawPath}" without activeDir`)
    return join(opts.activeDir, rawPath)
  }

  const segs = rawPath.split('/')
  const project = segs[0]
  const rest = segs.slice(1).join('/')
  const withSrc = SRC_DIRS.includes(firstSeg(rest)) ? rest : join('src', rest)
  return join(base, project, withSrc)
}

interface Located {
  projectName: string
  projectDir: string
  pkgName: string | null
  pkgDir: string | null
  relpath: string
}

function locate(abs: string, opts: ScaffoldOptions): Located {
  const base = expandHome(opts.baseProjectDir)
  const relBase = relative(base, abs)

  if (relBase && !relBase.startsWith('..') && !isAbsolute(relBase)) {
    const segs = relBase.split('/')
    const projectName = segs[0]
    const projectDir = join(base, projectName)

    if (segs[1] === 'packages' && segs.length > 2) {
      const pkgName = segs[2]
      return {
        projectName,
        projectDir,
        pkgName,
        pkgDir: join(projectDir, 'packages', pkgName),
        relpath: segs.slice(3).join('/'),
      }
    }

    return { projectName, projectDir, pkgName: null, pkgDir: null, relpath: segs.slice(1).join('/') }
  }

  if (opts.activeDir) {
    const active = opts.activeDir
    const relA = relative(active, abs)
    if (relA && !relA.startsWith('..') && !isAbsolute(relA)) {
      const segs = relA.split('/')
      const projectName = basename(active)

      if (segs[0] === 'packages' && segs.length > 1) {
        const pkgName = segs[1]
        return {
          projectName,
          projectDir: active,
          pkgName,
          pkgDir: join(active, 'packages', pkgName),
          relpath: segs.slice(2).join('/'),
        }
      }

      return { projectName, projectDir: active, pkgName: null, pkgDir: null, relpath: relA }
    }
  }

  const projectDir = dirname(abs)
  return { projectName: basename(projectDir), projectDir, pkgName: null, pkgDir: null, relpath: basename(abs) }
}

export function prepare(contents: string[], opts: ScaffoldOptions): ProjectData | null {
  const located: { entry: FileEntry; loc: Located }[] = []

  for (const content of contents) {
    const header = extractHeader(content)
    if (!header) continue

    const abs = resolvePath(header.rawPath, opts)
    if (abs === null) continue

    const loc = locate(abs, opts)
    located.push({ entry: { path: abs, relpath: loc.relpath, content: header.body }, loc })
  }

  if (located.length === 0) return null

  const projectName = located[0].loc.projectName
  const projectDir = located[0].loc.projectDir

  const projectFiles: FileEntry[] = []
  const pkgMap = new Map<string, PackageData>()

  for (const { entry, loc } of located) {
    if (loc.pkgDir && loc.pkgName) {
      let pkg = pkgMap.get(loc.pkgDir)
      if (!pkg) {
        pkg = { name: loc.pkgName, isNew: null, files: [], dir: loc.pkgDir, deps: {}, devDeps: {} }
        pkgMap.set(loc.pkgDir, pkg)
      }
      pkg.files.push(entry)
    } else {
      projectFiles.push(entry)
    }
  }

  return {
    name: projectName,
    isNew: null,
    files: projectFiles,
    dir: projectDir,
    packages: [...pkgMap.values()],
  }
}
