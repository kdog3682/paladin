import { join, basename } from 'path'
import { expandHome } from '../../utils/path'

// dirs that are already "src-like" and shouldn't get 'src' prepended again
const SRC_DIRS = ['src', 'docs', 'scripts']
// package names that should have their files nested under 'components'
const COMPONENT_PKGS = ['web', 'ui']

// first path segment, e.g. 'a/b/c' -> 'a'
function firstSeg(p: string): string {
  return p.split('/')[0]
}

// for web/ui packages, insert a 'components' segment into the tail
// unless one is already present somewhere in the path
function injectComponents(pkgName: string, tail: string): string {
  return tail
  if (!tail || !COMPONENT_PKGS.includes(pkgName)) return tail
  if (tail.split('/').includes('components')) return tail
  if (tail.includes('App')) {
    // we dont return when it is natively something like App.tsx
    return tail
  }
  return join('components', tail)
}

// prepend 'src' unless the tail already starts with a known src-like dir
function withSrcDir(tail: string): string {
  return SRC_DIRS.includes(firstSeg(tail)) ? tail : join('src', tail)
}

// resolves a package-relative tail: components injection (web/ui) then src dir
function resolvePkgTail(pkgName: string, tail: string): string {
  return withSrcDir(injectComponents(pkgName, tail))
}

/**
 * Resolve a raw header path (e.g. '@paladin/web/Foobar/useFoo.ts') into an
 * absolute filesystem path.
 *
 * @param raw - the raw path string pulled from the file's header comment
 * @param base - root dir containing all projects, defaults to ~/projects
 * @param activeDir - dir to resolve bare/relative paths against, if any
 */
export function resolvePath(
  raw: string,
  base: string = '~/projects',
  activeDir: string | null = null
): string | null {
  const baseDir = expandHome(base)

  // scripts always live in a fixed location, regardless of where they were "written"
  if (raw.includes('/scripts/') || raw.includes('.script.')) {
    return join(baseDir, 'paladin', 'scripts', basename(raw))
  }
    if (raw.startsWith('@ui')) {
    raw = '@paladin/web/ui' + raw.slice(3)
  }
  else if (raw.startsWith('@web')) {
    raw = '@paladin' + raw.slice(1)
  }

  // already-absolute or home-relative paths pass through untouched
  if (raw.startsWith('/') || raw.startsWith('~')) {
    return expandHome(raw)
  }

  // shorthand: 'paladin/...' means '@paladin/...'
  if (raw.startsWith('paladin')) {
    raw = '@' + raw
  }

  // '@scope/...' paths reference a project + package
  if (raw.startsWith('@')) {
    const segs = raw.slice(1).split('/')
    const scope = segs[0]
    const rest = segs.slice(1)

    // allow both '@scope/packages/pkg/...' and '@scope/pkg/...'
    const isPackagesPrefixed = rest[0] === 'packages'
    const pkg = isPackagesPrefixed ? rest[1] : rest[0]
    const tail = (isPackagesPrefixed ? rest.slice(2) : rest.slice(1)).join('/')

    if (!tail) return join(baseDir, scope, 'packages', pkg)
    return join(baseDir, scope, 'packages', pkg, resolvePkgTail(pkg, tail))
  }

  // bare filenames, './' or '../' relative paths, or paths that start
  // directly inside a src-like dir all resolve against activeDir
  const isBasename = !raw.includes('/')
  const isDotRel = raw.startsWith('./') || raw.startsWith('../')
  if (isBasename || isDotRel || SRC_DIRS.includes(firstSeg(raw))) {
    if (!activeDir) throw new Error(`scaffold: cannot resolve relative path "${raw}" without activeDir`)
    return join(activeDir, raw)
  }

  // otherwise treat the first segment as a project name (no package)
  const segs = raw.split('/')
  const project = segs[0]
  const rest = segs.slice(1).join('/')
  return join(baseDir, project, withSrcDir(rest))
}
