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

/**
 * Single-segment tails matching any of these live at the package root rather
 * than inside a src-like dir. Strings match exactly, regexes are tested against
 * the whole segment.
 */
export const pkgRootFiles: (string | RegExp)[] = [
  /^\./, // .gitignore, .env, .npmrc, .prettierrc
  /^package(-lock)?\.json$/,
  /^bun\.lockb?$/,
  /^bunfig\.toml$/,
  /^tsconfig(\..+)?\.json$/,
  /^jsconfig(\..+)?\.json$/,
  /^readme(\..+)?$/i,
  /^license(\..+)?$/i,
  /^changelog(\..+)?$/i,
  /^(claude|agents)\.md$/i,
  /^dockerfile$/i,
  /^makefile$/i,
  /\.config\.[cm]?[jt]sx?$/ // vite.config.ts, tailwind.config.js
]

/** `@SymbolViewerApplet/...` style specifiers: a capitalized name standing in for a web2 dir. */
const capitalizedScope = /^@([A-Z][A-Za-z0-9]*)(\/.*)?$/

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
  /** files that belong at the package root instead of a src-like dir */
  rootFiles?: (string | RegExp)[]
  /** scoped prefix a `@Capitalized` name resolves under */
  capitalizedPrefix?: string
}

/** True for a bare filename that belongs at the package root. */
function isPkgRootFile(tail: string, patterns: (string | RegExp)[]): boolean {
  if (!tail || tail.includes('/')) return false
  return patterns.some(p => (typeof p === 'string' ? p === tail : p.test(tail)))
}

function splitSrcDir(tail: string, srcDirs: string[]): { dir: string; tail: string } {
  const [head, ...rest] = tail.split('/')
  if (srcDirs.includes(head)) return { dir: head, tail: rest.join('/') }
  return { dir: srcDirs[0] ?? 'src', tail }
}

/**
 * Resolve a specifier into an absolute filesystem path. Absolute and '~' paths pass through,
 * single-segment and './' paths resolve against relativeTo, everything else must be scoped
 * as '@scope/pkg/tail'. Manifest-style files (package.json, tsconfig.json, dotfiles, ...)
 * land at the package root; prefix them with a src-like dir to override. Other .md files
 * land in docs/ instead of src/ (foobar.md -> docs/foobar.md). A '@Capitalized' name
 * is a shorthand for a dir under capitalizedPrefix.
 * example: @mathpen/manim -> ~/projects/mathpen/packages/manim
 * example: @mathpen/manim/package.json -> ~/projects/mathpen/packages/manim/package.json
 * example: @ManimViewer/index.ts -> ~/projects/paladin/packages/web2/src/applets/ManimViewer/index.ts
 */
export function resolveScopedPath(input: string, opts: ResolveScopedPathOptions = {}): string {
  const {
    base = '~/projects',
    relativeTo = null,
    srcDirs = ['src', 'docs', 'scripts', 'corpus', 'dev'],
    packagesDir = 'packages',
    rootFiles = pkgRootFiles,
    capitalizedPrefix = '@paladin/web2/src/applets',
    aliases = {
      '@ui': '@paladin/ui',
      '@web': '@paladin/web',
      '@utils': '@paladin/utils',
      '@cmd': '@paladin/api2/src/commands',
      '@api': '@paladin/api2',
      '@services': '@paladin/api/services',
      paladin: '@paladin'
    },
    routers = []
  } = opts

  let raw = input.trim()
  if (!raw) throw new Error('resolveScopedPath: empty path')

  const capitalized = capitalizedPrefix ? capitalizedScope.exec(raw) : null
  if (capitalized) {
    const [, name, rest = ''] = capitalized
    raw = `${capitalizedPrefix}/${name}${rest}`
  }

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

  if (isPkgRootFile(rawTail, rootFiles)) return join(pkgDir, rawTail)

  const { dir: splitDir, tail: split } = splitSrcDir(rawTail, srcDirs)
  /* markdown never lives in src/: it goes in docs/ (root-level ones were handled above) */
  const dir = splitDir === 'src' && split.endsWith('.md') ? 'docs' : splitDir
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
 * dropped. Package-root files keep their bare form, and a root-file name that
 * really does sit inside the default src dir keeps that dir explicit so the
 * specifier round-trips.
 * @example /base/paladin/packages/web/src/Foo.tsx -> @paladin/web/Foo.tsx
 * @example /base/paladin/packages/web/package.json -> @paladin/web/package.json
 * @example /base/paladin/packages/web/docs/SPEC.md -> @paladin/web/SPEC.md
 * @example /base/paladin/packages/web/src/package.json -> @paladin/web/src/package.json
 */
export function toScopedPath(input: string, opts: ResolveScopedPathOptions = {}): string {
  const {
    base = '~/projects',
    srcDirs = ['src', 'docs', 'scripts', 'corpus', 'dev'],
    packagesDir = 'packages',
    rootFiles = pkgRootFiles,
    capitalizedPrefix = '@paladin/web2/src/applets'
  } = opts

  const scoped = toFullScopedPath(input, { base, srcDirs, packagesDir, rootFiles })
  if (!capitalizedPrefix) return scoped

  /* @paladin/web2/applets/ManimViewer/x.ts -> @ManimViewer/x.ts */
  const defaultDir = srcDirs[0] ?? 'src'
  const prefix =
    capitalizedPrefix.replace(new RegExp(`^(@[^/]+/[^/]+)/${defaultDir}(/|$)`), '$1$2').replace(/\/?$/, '/')
  if (!scoped.startsWith(prefix)) return scoped
  const rest = scoped.slice(prefix.length)
  return /^[A-Z][A-Za-z0-9]*(\/|$)/.test(rest) ? `@${rest}` : scoped
}

function toFullScopedPath(input: string, opts: ResolveScopedPathOptions): string {
  const { base = '~/projects', srcDirs = ['src'], packagesDir = 'packages', rootFiles = pkgRootFiles } = opts

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
  /* resolveScopedPath routes bare .md tails into docs/, so docs/foo.md round-trips as foo.md */
  if (dir === 'docs' && tail.endsWith('.md') && !isPkgRootFile(tail, rootFiles)) return `@${scope}/${pkg}/${tail}`
  if (dir !== defaultDir) return `@${scope}/${pkg}/${dir}/${tail}`
  if (hasExplicitDir && isPkgRootFile(tail, rootFiles)) return `@${scope}/${pkg}/${dir}/${tail}`
  return `@${scope}/${pkg}/${tail}`
}
