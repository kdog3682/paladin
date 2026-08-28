import { existsSync, readFileSync } from 'fs'
import { isBuiltin } from 'module'
import { basename, extname, join, relative } from 'path'
import { bash, collectImports, expandHome } from '@paladin/utils'
import type { Project, ScaffoldOptions, Unit } from '../types'

const DEFAULT_CACHE_PATH = join(expandHome('~/projects/paladin'), 'npm-dependencies.json')
const IMPORT_EXTS = new Set(['.ts', '.tsx'])

type Manifest = {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  [key: string]: unknown
}

const versionCaches = new Map<string, Record<string, string>>()
const dirtyCaches = new Set<string>()
const localDirs = new Map<string, boolean>()

function versionsFor(cachePath: string): Record<string, string> {
  const cached = versionCaches.get(cachePath)
  if (cached) return cached

  const loaded: Record<string, string> = existsSync(cachePath)
    ? JSON.parse(readFileSync(cachePath, 'utf8'))
    : {}
  versionCaches.set(cachePath, loaded)
  return loaded
}

const isTestFile = (path: string) =>
  /\.(test|spec)\.[jt]sx?$/.test(path) || /(?:^|\/)(test|__tests__)\//.test(path)

const isImportable = (path: string) => IMPORT_EXTS.has(extname(path))

const stripJsonComments = (text: string) => text.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')

async function readManifest(unit: Unit): Promise<Manifest> {
  const authored = unit.files.find((file) => basename(file.path) === 'package.json')
  if (authored) return JSON.parse(stripJsonComments(authored.content))

  const path = join(unit.dir, 'package.json')
  return existsSync(path) ? JSON.parse(stripJsonComments(await Bun.file(path).text())) : {}
}

/** `@paladin/utils/collectImports` -> `@paladin/utils`, `lodash/fp` -> `lodash`. */
function packageRoot(source: string): string {
  const parts = source.split('/')
  return source.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]!
}

function ownerOf(source: string): string {
  return (source.startsWith('@') ? source.slice(1) : source).split('/')[0]!
}

function exists(dir: string): boolean {
  const cached = localDirs.get(dir)
  if (cached !== undefined) return cached

  const found = existsSync(dir)
  localDirs.set(dir, found)
  return found
}

/**
 * A root under the project's own scope is a sibling unit, so `workspace:*` covers
 * it. Anything else is still local when its project dir exists under `base` —
 * `@paladin/utils` seen from `@mathpen/manim` is `<base>/paladin/packages/utils`,
 * linked by relative path since it lives outside this workspace. `null` means
 * it's an npm package.
 */
function localSpec(root: string, from: string, scope: string, base: string): string | null {
  if (ownerOf(root) === scope) return 'workspace:*'

  const owner = ownerOf(root)
  if (!exists(join(base, owner))) return null

  const [, pkg] = root.split('/')
  const dir = join(base, owner, 'packages', pkg!)
  const path = relative(from, dir)
  return `file:${path.startsWith('.') ? path : `./${path}`}`
}

async function version(name: string, cachePath: string): Promise<string> {
  const versions = versionsFor(cachePath)
  const cached = versions[name]
  if (cached) return cached

  const res = await fetch(`https://registry.npmjs.org/${name}/latest`)
  const data = (await res.json()) as { version?: string }
  if (!data.version) throw new Error(`scaffold: no version found for "${name}"`)

  const spec = `^${data.version}`
  versions[name] = spec
  dirtyCaches.add(cachePath)
  return spec
}

/** Returns whether the unit's manifest gained anything. */
async function applyUnit(
  unit: Unit,
  scope: string,
  base: string,
  cachePath: string,
): Promise<boolean> {
  const manifest = await readManifest(unit)
  const declared = new Set([
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.devDependencies ?? {}),
  ])
  const self = `@${scope}/${unit.name}`

  const deps: Record<string, string> = {}
  const devDeps: Record<string, string> = {}

  for (const file of unit.files) {
    if (!isImportable(file.path)) continue
    const bucket = isTestFile(file.path) ? devDeps : deps

    for (const ref of collectImports(file.content)) {
      if (ref.type === 'local' || isBuiltin(ref.source)) continue

      const root = packageRoot(ref.source)
      if (root === self || declared.has(root) || root in deps || root in devDeps) continue

      bucket[root] = localSpec(root, unit.dir, scope, base) ?? (await version(root, cachePath))
    }
  }

  const gained = Boolean(Object.keys(deps).length || Object.keys(devDeps).length)

  if (gained) {
    manifest.dependencies = { ...(manifest.dependencies ?? {}), ...deps }
    manifest.devDependencies = { ...(manifest.devDependencies ?? {}), ...devDeps }
    if (!Object.keys(manifest.dependencies).length) delete manifest.dependencies
    if (!Object.keys(manifest.devDependencies).length) delete manifest.devDependencies
  }

  const authored = unit.files.some((file) => basename(file.path) === 'package.json')
  if (gained || authored) {
    await Bun.write(join(unit.dir, 'package.json'), JSON.stringify(manifest, null, 2) + '\n')
  }

  return gained
}

/**
 * Works out what each unit needs, writes it into the manifests, and installs if
 * anything changed. Returns whether an install ran.
 */
export async function resolveDependencies(
  project: Project,
  opts: ScaffoldOptions,
): Promise<boolean> {
  const scope = project.name.replace(/^@/, '')
  const cachePath = opts.npmCachePath ?? DEFAULT_CACHE_PATH
  let changed = false

  for (const unit of project.units) {
    if (await applyUnit(unit, scope, opts.base, cachePath)) changed = true
  }

  if (dirtyCaches.has(cachePath)) {
    await Bun.write(cachePath, JSON.stringify(versionsFor(cachePath), null, 2) + '\n')
    dirtyCaches.delete(cachePath)
  }

  if (!changed) return false

  await bash(['bun', 'install'], { cwd: project.dir, strict: true })
  return true
}
