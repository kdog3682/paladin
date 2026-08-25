// replaces @paladin/api/src/services/scaffold/resolve-path.ts

import { join } from 'path'
import { expandHome } from './expandHome'

/** A specifier split at the package boundary: '@paladin/web/Foo.tsx' -> scope 'paladin', pkg 'web', tail 'Foo.tsx'. */
export type ScopedRoute = {
  scope: string
  pkg: string
  tail: string
}

/** Returns a replacement tail, or nothing to pass; runs before the src dir is applied. */
export type TailRouter = (route: ScopedRoute) => string | null | undefined

export type ResolveScopedPathOptions = {
  /** root dir containing all scopes/projects */
  base?: string
  /** dir to resolve bare and './' style paths against */
  relativeTo?: string | null
  /** dirs that are already src-like, so 'src' isn't prepended again */
  srcDirs?: string[]
  /** segment between scope and package, or null for a flat layout */
  packagesDir?: string | null
  /** prefix rewrites applied on segment boundaries */
  aliases?: Record<string, string>
  /** rewrite the package-relative tail before the src dir is applied */
  routers?: TailRouter[]
}

function withSrcDir(tail: string, srcDirs: string[]): string {
  if (!tail) return ''
  return srcDirs.includes(tail.split('/')[0]) ? tail : join('src', tail)
}

/**
 * Resolve a scoped specifier into an absolute filesystem path.
 *
 *   '@paladin'                       -> <base>/paladin
 *   '@paladin/web'                   -> <base>/paladin/packages/web
 *   '@paladin/web/Foo/useFoo.ts'     -> <base>/paladin/packages/web/src/components/Foo/useFoo.ts
 *   '@paladin/web/docs/readme.md'    -> <base>/paladin/packages/web/docs/readme.md
 *   'someproject/lib/x.ts'           -> <base>/someproject/src/lib/x.ts
 *   'x.ts' | './x.ts' | 'src/x.ts'   -> <relativeTo>/...
 *
 * Throws when the input is empty, malformed, or needs a relativeTo that wasn't given.
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
      ({ pkg, tail }) => {
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

  const baseDir = expandHome(base)

  if (raw.startsWith('@')) {
    const segs = raw.slice(1).split('/').filter(Boolean)
    const scope = segs[0]
    if (!scope) throw new Error(`resolveScopedPath: missing scope in "${input}"`)

    const rest = segs.slice(1)
    if (!rest.length) return join(baseDir, scope)

    const isPrefixed = packagesDir !== null && rest[0] === packagesDir
    const pkg = isPrefixed ? rest[1] : rest[0]
    if (!pkg) throw new Error(`resolveScopedPath: missing package in "${input}"`)

    const pkgDir =
      packagesDir === null ? join(baseDir, scope, pkg) : join(baseDir, scope, packagesDir, pkg)

    let tail = (isPrefixed ? rest.slice(2) : rest.slice(1)).join('/')
    if (!tail) return pkgDir

    for (const route of routers) {
      const next = route({ scope, pkg, tail })
      if (next) tail = next
    }

    return join(pkgDir, withSrcDir(tail, srcDirs))
  }

  const segs = raw.split('/').filter(Boolean)
  const isRelative =
    segs.length === 1 || raw.startsWith('./') || raw.startsWith('../') || srcDirs.includes(segs[0])

  if (isRelative) {
    if (!relativeTo) {
      throw new Error(`resolveScopedPath: cannot resolve "${input}" without a relativeTo dir`)
    }
    return join(relativeTo, raw)
  }

  return join(baseDir, segs[0], withSrcDir(segs.slice(1).join('/'), srcDirs))
}
