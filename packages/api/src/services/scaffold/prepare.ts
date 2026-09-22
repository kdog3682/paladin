import { relative, isAbsolute, basename, dirname, join } from 'path'
import { expandHome } from '../../utils/path'
import { resolvePath } from './resolve-path'
import type { ScaffoldOptions, ProjectData, PackageData, FileEntry } from './types'

// matches a leading '// path' or '# path' comment line
const COMMENT_RE = /^\s*(?:\/\/|#)\s*(.+?)\s*$/
// requires the path to end in a file extension, e.g. '.ts'
const EXT_RE = /\.[a-z0-9]+$/i

/**
 * Pulls the path header off the first line of a file's content (after an
 * optional shebang). Returns null if there's no valid header, the file is
 * empty, or it's marked deprecated.
 */
export function extractHeader(content: string): { rawPath: string; body: string } | null {
  if (content.trim() === '') return null

  const lines = content.split('\n')
  if (lines.slice(0, 3).join('\n').toLowerCase().includes('deprecated')) return null

  // skip a shebang line if present, so the header comment is checked next
  let commentIdx = 0
  if (lines[0] !== undefined && lines[0].startsWith('#!')) commentIdx = 1

  const line = lines[commentIdx]
  if (line === undefined) return null

  const match = line.match(COMMENT_RE)
  if (!match) return null

  const rawPath = match[1].trim()
  if (!rawPath || !EXT_RE.test(rawPath)) return null

  // body is everything except the header/shebang line, with leading blank lines trimmed
  const body = lines
    .filter((_, i) => i !== commentIdx)
    .join('\n')
    .replace(/^\n+/, '')

  return { rawPath, body }
}

interface Located {
  projectName: string
  projectDir: string
  pkgName: string | null
  pkgDir: string | null
  relpath: string
}

// if segs[pkgIdx] === 'packages', extract the package entry from segs; else null.
// pkgIdx is the index of the 'packages' segment, which shifts depending on
// whether segs starts at the projects root (1) or at activeDir itself (0)
function extractPackageEntry(
  segs: string[],
  projectName: string,
  projectDir: string,
  pkgIdx: number
): Located | null {
  if (segs[pkgIdx] !== 'packages' || segs.length <= pkgIdx + 1) return null
  const pkgName = segs[pkgIdx + 1]
  return {
    projectName,
    projectDir,
    pkgName,
    pkgDir: join(projectDir, 'packages', pkgName),
    relpath: segs.slice(pkgIdx + 2).join('/'),
  }
}

/**
 * Given an absolute file path, figure out which project (and optionally
 * package) it belongs to, plus its path relative to that location.
 */
function locateInProject(abs: string, opts: ScaffoldOptions): Located {
  const base = expandHome(opts.baseProjectDir)
  const relBase = relative(base, abs)

  // fast path: abs lives cleanly inside the projects root
  if (relBase && !relBase.startsWith('..') && !isAbsolute(relBase)) {
    const segs = relBase.split('/')
    const projectName = segs[0]
    const projectDir = join(base, projectName)
    return (
      extractPackageEntry(segs, projectName, projectDir, 1) ?? {
        projectName,
        projectDir,
        pkgName: null,
        pkgDir: null,
        relpath: segs.slice(1).join('/'),
      }
    )
  }

  // fallback: abs lives inside the currently active project dir
  if (opts.activeDir) {
    const active = opts.activeDir
    const relA = relative(active, abs)
    if (relA && !relA.startsWith('..') && !isAbsolute(relA)) {
      const segs = relA.split('/')
      const projectName = basename(active)
      return (
        extractPackageEntry(segs, projectName, active, 0) ?? {
          projectName,
          projectDir: active,
          pkgName: null,
          pkgDir: null,
          relpath: relA,
        }
      )
    }
  }

  // last resort: abs is unrelated to base/activeDir, treat its parent dir as the project
  const projectDir = dirname(abs)
  return { projectName: basename(projectDir), projectDir, pkgName: null, pkgDir: null, relpath: basename(abs) }
}

/**
 * Parses each file's header, resolves it to an absolute path, and groups
 * the results into a single ProjectData tree (with nested packages).
 */
export function prepare(contents: string[], opts: ScaffoldOptions): ProjectData | null {
  const located: { entry: FileEntry; loc: Located }[] = []

  for (const content of contents) {
    const header = extractHeader(content)
    if (!header) continue

    const abs = resolvePath(header.rawPath, opts.baseProjectDir, opts.activeDir ?? null)
    if (abs === null) continue

    const loc = locateInProject(abs, opts)
    located.push({ entry: { path: abs, relpath: loc.relpath, content: header.body }, loc })
  }

  if (located.length === 0) return null

  // all entries share the same project (the first one determines it)
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
