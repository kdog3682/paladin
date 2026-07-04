import { homedir } from 'os'
import { join, basename } from 'path'

const BASE_DIR = '~/projects'

const SRC_DIRS = ['src', 'docs', 'scripts']
const COMPONENT_PKGS = ['web', 'ui']

// leading line/block comment opener (js, py/sh, sql/lua, lisp, latex, css/c, html), capturing the rest
const COMMENT_RE = /^\s*(?:\/\/+|#+|--|;+|%+|\/\*+|<!--)\s*(.*?)\s*(?:\*\/|-->)?\s*$/
// trailing file extension, e.g. '.ts' in 'foo.script.ts'
const EXT_RE = /\.[a-z0-9]+$/i

/** Expand a leading '~' to the user's home directory. */
export function expandHome(path: string): string {
  if (!path.startsWith('~')) return path
  if (path === '~') return homedir()
  return join(homedir(), path.slice(2))
}

function firstSeg(p: string): string {
  return p.split('/')[0]
}

// for web/ui pkgs, nest tail under 'components' unless already present
function injectComponents(pkgName: string, tail: string): string {
  if (!tail || !COMPONENT_PKGS.includes(pkgName)) return tail
  if (tail.split('/').includes('components')) return tail
  return join('components', tail)
}

// prepend 'src' unless tail already starts with a src-like dir
function withSrcDir(tail: string): string {
  return SRC_DIRS.includes(firstSeg(tail)) ? tail : join('src', tail)
}

function resolvePkgTail(pkgName: string, tail: string): string {
  return withSrcDir(injectComponents(pkgName, tail))
}

/** Resolve a raw header path (bare, relative, '@scope/pkg/...', or project-rooted) to an absolute path. */
export function resolveProjectWorkspacePath(raw: string, activeDir?: string): string | null {
  const baseDir = expandHome(BASE_DIR)

  // scripts always live in a fixed location
  if (raw.includes('/scripts/') || raw.includes('.script.')) {
    return join(baseDir, 'paladin', 'scripts', basename(raw))
  }

  // absolute or home-relative pass through
  if (raw.startsWith('/') || raw.startsWith('~')) {
    return expandHome(raw)
  }

  // shorthand: 'paladin/...' -> '@paladin/...'
  if (raw.startsWith('paladin')) raw = '@' + raw

  // '@scope/...' references a project + package
  if (raw.startsWith('@')) {
    const segs = raw.slice(1).split('/')
    const scope = segs[0]
    const rest = segs.slice(1)
    const isPackagesPrefixed = rest[0] === 'packages'
    const pkg = isPackagesPrefixed ? rest[1] : rest[0]
    const tail = (isPackagesPrefixed ? rest.slice(2) : rest.slice(1)).join('/')
    if (!tail) return join(baseDir, scope, 'packages', pkg)
    return join(baseDir, scope, 'packages', pkg, resolvePkgTail(pkg, tail))
  }

  // bare filename, './' or '../', or src-like first seg -> resolve against activeDir
  const isBasename = !raw.includes('/')
  const isDotRel = raw.startsWith('./') || raw.startsWith('../')
  if (isBasename || isDotRel || SRC_DIRS.includes(firstSeg(raw))) {
    return activeDir ? join(activeDir, raw) : null
  }

  // otherwise first segment is a project name (no package)
  const segs = raw.split('/')
  const project = segs[0]
  const rest = segs.slice(1).join('/')
  return join(baseDir, project, withSrcDir(rest))
}

/**
 * Extract a workspace path from a file's first header comment, in any common
 * comment style (`//`, `#`, `--`, `;`, `%`, `/* *​/`, `<!-- -->`).
 * Skips shebangs, ignores deprecated files, requires a file extension.
 */
export function extractCommentHeaderPath(content: string): string | null {
  if (content.trim() === '') return null

  const lines = content.split('\n')
  if (lines.slice(0, 3).join('\n').toLowerCase().includes('deprecated')) return null

  // skip a shebang so the header comment is checked next
  const commentIdx = lines[0]?.startsWith('#!') ? 1 : 0

  const line = lines[commentIdx]
  if (line === undefined) return null

  const match = line.match(COMMENT_RE)
  if (!match) return null

  const rawPath = match[1].trim()
  if (!rawPath || !EXT_RE.test(rawPath)) return null

  return rawPath
}
