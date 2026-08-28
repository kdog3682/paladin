import { isAbsolute, join, relative, sep } from 'path'
import { expandHome } from './expandHome'

/** A specifier split at the package boundary, with the src-like dir already peeled off. */
export type ScopedRoute = {
  scope: string
  pkg: string
  /** the src-like dir the tail will land in: 'src', 'docs', 'scripts', ... */
  dir: string
  /** path below dir, e.g. 'Foo/useFoo.ts' */
  tail: string
}

/** Returns a replacement tail, or nothing to pass. */
export type TailRouter = (route: ScopedRoute) => string | null | undefined

export type ResolveScopedPathOptions = {
  /** root dir containing all scopes/projects */
  base?: string
  /** dir to resolve bare and './' style paths against */
  relativeTo?: string | null
  /** dirs that are already src-like, so 'src' isn't prepended */
  srcDirs?: string[]
  /** segment between scope and package, or null for a flat layout */
  packagesDir?: string | null
  /** prefix rewrites applied on segment boundaries */
  aliases?: Record<string, string>
  /** rewrite the dir-relative tail */
  routers?: TailRouter[]
}

function splitSrcDir(tail: string, srcDirs: string[]): { dir: string; tail: string } {
  const [head, ...rest] = tail.split('/')
  if (srcDirs.includes(head)) return { dir: head, tail: rest.join('/') }
  return { dir: srcDirs[0] ?? 'src', tail }
}

/**
 * Resolve a specifier into an absolute filesystem path. Absolute and '~' paths pass through,
 * single-segment and './' paths resolve against relativeTo, everything else must be scoped
 * as '@scope/pkg/tail'. 
 * example: @mathpen/manim -> ~/projects/mathpen/packages/manim
 */
export function resolveScopedPath(input: string, opts: ResolveScopedPathOptions = {}): string {
  const {
    base = '~/projects',
    relativeTo = null,
    srcDirs = ['src', 'docs', 'scripts', 'corpus'],
    packagesDir = 'packages',
    aliases = {
      '@ui': '@paladin/web/ui',
      '@web': '@paladin/web',
      '@services': '@paladin/api/services',
      paladin: '@paladin'
    },
    routers = [
      ({ pkg, dir, tail }) => {
        if (dir !== 'src') return
        if (!['web', 'ui'].includes(pkg)) return
        if (tail.split('/').includes('components')) return
        if (tail.includes('App')) return
        return join('components', tail)
      }
    ]
  } = opts

  let raw = input.trim()
  if (!raw) throw new Error('resolveScopedPath: empty path')

  for (const [from, to] of Object.entries(aliases)) {
    if (raw === from) {
      raw = to
      break
    }
    if (raw.startsWith(from + '/')) {
      raw = to + raw.slice(from.length)
      break
    }
  }

  if (raw.startsWith('/') || raw.startsWith('~')) return expandHome(raw)

  if (!raw.startsWith('@')) {
    const segs = raw.split('/').filter(Boolean)
    const isRelative =
      segs.length === 1 || raw.startsWith('./') || raw.startsWith('../') || srcDirs.includes(segs[0])

    if (!isRelative) {
      throw new Error(`resolveScopedPath: "${input}" must be scoped, e.g. "@paladin/web/${raw}"`)
    }
    if (!relativeTo) {
      throw new Error(`resolveScopedPath: cannot resolve "${input}" without a relativeTo dir`)
    }
    return join(relativeTo, raw)
  }

  const baseDir = expandHome(base)
  const [scope, ...rest] = raw.slice(1).split('/').filter(Boolean)
  if (!rest.length) return join(baseDir, scope)

  const isPrefixed = packagesDir !== null && rest[0] === packagesDir
  const pkg = isPrefixed ? rest[1] : rest[0]
  if (!pkg) throw new Error(`resolveScopedPath: missing package in "${input}"`)

  const pkgDir =
    packagesDir === null ? join(baseDir, scope, pkg) : join(baseDir, scope, packagesDir, pkg)

  const rawTail = (isPrefixed ? rest.slice(2) : rest.slice(1)).join('/')
  if (!rawTail) return pkgDir

  const { dir, tail: split } = splitSrcDir(rawTail, srcDirs)
  let tail = split

  for (const route of routers) {
    const next = route({ scope, pkg, dir, tail })
    if (next) tail = next
  }

  return join(pkgDir, dir, tail)
}

/**
 * Inverse of resolveScopedPath: converts an absolute path under `base` back
 * into a scoped specifier. The default src dir (srcDirs[0]) is omitted when a
 * tail follows, other src-like dirs are kept, and the `packages` segment is
 * dropped.
 * @example /base/paladin/packages/web/src/Foo.tsx -> @paladin/web/Foo.tsx
 */
export function toScopedPath(input: string, opts: ResolveScopedPathOptions = {}): string {
  const {
    base = '~/projects',
    srcDirs = ['src', 'docs', 'scripts', 'corpus'],
    packagesDir = 'packages'
  } = opts

  const raw = input.trim()
  if (!raw) throw new Error('toScopedPath: empty path')

  const baseDir = expandHome(base)
  const rel = relative(baseDir, expandHome(raw)).split(sep).join('/')
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`toScopedPath: "${input}" is not under base "${base}"`)
  }

  const segs = rel.split('/').filter(Boolean)
  const scope = segs[0]
  if (!scope) throw new Error(`toScopedPath: cannot derive a scope from "${input}"`)
  if (segs.length === 1) return `@${scope}`

  const isPrefixed = packagesDir !== null && segs[1] === packagesDir
  const pkg = isPrefixed ? segs[2] : segs[1]
  if (!pkg) throw new Error(`toScopedPath: missing package in "${input}"`)

  const rest = isPrefixed ? segs.slice(3) : segs.slice(2)
  if (rest.length === 0) return `@${scope}/${pkg}`

  const defaultDir = srcDirs[0] ?? 'src'
  const hasExplicitDir = srcDirs.includes(rest[0])
  const dir = hasExplicitDir ? rest[0] : defaultDir
  const tail = (hasExplicitDir ? rest.slice(1) : rest).join('/')

  if (!tail) return `@${scope}/${pkg}/${dir}`
  return dir === defaultDir ? `@${scope}/${pkg}/${tail}` : `@${scope}/${pkg}/${dir}/${tail}`
}
