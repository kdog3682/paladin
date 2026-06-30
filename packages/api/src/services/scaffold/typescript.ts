// Scaffolds a TypeScript project (and its workspace packages) from a set of
// author-provided source files. The flow:
//
//   1. `prepare` parses the file contents into a project — a root directory
//      plus zero or more workspace packages.
//   2. The root and each package become a "target": a directory that owns its
//      own package.json. Their author files are snapshotted, then synced to disk.
//   3. Brand-new targets are hydrated from templates (the monorepo root, plus an
//      astro/react/typescript template per package based on its file types).
//   4. Each target's imports are scanned. Any imported module not already
//      declared in that target's package.json is added — workspace packages as
//      `workspace:*`, everything else pinned to the latest npm version (cached
//      on disk across runs). Already-declared deps are left untouched.
//   5. If any manifest gained a dependency, `bun install` runs once at the root.

import { join, extname } from 'path'
import { existsSync, readFileSync } from 'fs'
import { expandHome } from '../../utils/path'
import { bash } from '../../utils/bash'
import { prepare } from './prepare'
import { collectImports } from './imports'
import { hydrate } from './hydrate'
import { syncFiles } from './shared'
import type { ScaffoldOptions, FileEntry, PreparedProject } from './types'

const NPM_DEPS_CACHE = expandHome('~/projects/paladin/npm-dependencies.json')
const IMPORT_EXTS = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'])

type PkgType = 'astro' | 'react' | 'typescript'
type Project = NonNullable<ReturnType<typeof prepare>>

/** A directory that owns its own package.json — the project root or a package. */
interface ScaffoldTarget {
  name: string
  dir: string
  isNew: boolean
  files: FileEntry[]
}

interface DepSets {
  deps: Record<string, string>
  devDeps: Record<string, string>
}

interface Manifest {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  [key: string]: unknown
}

function isTestFile(path: string): boolean {
  return /\.(test|spec)\.[jt]sx?$/.test(path) || /(?:^|\/)(test|__tests__)\//.test(path)
}

function detectPackageType(files: FileEntry[]): PkgType {
  const exts = new Set(files.map((f) => extname(f.path)))
  if (exts.has('.astro')) return 'astro'
  if (exts.has('.tsx') || exts.has('.jsx')) return 'react'
  return 'typescript'
}

function workspaceName(root: string): string | null {
  return root.startsWith('@') ? (root.split('/')[1] ?? null) : null
}

async function readManifest(dir: string): Promise<Manifest> {
  const path = join(dir, 'package.json')
  return existsSync(path) ? JSON.parse(await Bun.file(path).text()) : {}
}

/**
 * Resolves the dependencies a scaffold target needs.
 *
 * Imports already declared in a target's package.json are skipped — no version
 * lookup, no manifest write. Newly-needed deps are added to the manifest and
 * returned. npm versions are pinned to the latest stable release and cached on
 * disk (default: NPM_DEPS_CACHE) so they're resolved at most once across runs.
 */
class DependencyResolver {
  private readonly cache: Record<string, string>
  private dirty = false

  constructor(
    private readonly workspaceNames: Set<string>,
    private readonly cachePath = NPM_DEPS_CACHE,
  ) {
    this.cache = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, 'utf8')) : {}
  }

  /** Returns the deps added to `target`, or null when nothing was new. */
  async resolve(target: ScaffoldTarget): Promise<DepSets | null> {
    const manifest = await readManifest(target.dir)
    const declared = new Set([
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.devDependencies ?? {}),
    ])

    const deps: Record<string, string> = {}
    const devDeps: Record<string, string> = {}

    for (const file of target.files) {
      if (!IMPORT_EXTS.has(extname(file.path))) continue
      const bucket = isTestFile(file.path) ? devDeps : deps

      let imports: string[]
      try {
        imports = await collectImports(file.content)
      } catch (err) {
        console.error(`collectImports failed on ${file.path}:`, err)
        throw err
      }
      for (const root of imports) {
        if (declared.has(root) || root in deps || root in devDeps) continue

        const workspace = workspaceName(root)
        if (workspace && this.workspaceNames.has(workspace)) {
          if (workspace !== target.name) bucket[root] = 'workspace:*'
        } else {
          bucket[root] = await this.version(root)
        }
      }
    }

    if (!Object.keys(deps).length && !Object.keys(devDeps).length) return null

    manifest.dependencies = { ...(manifest.dependencies ?? {}), ...deps }
    manifest.devDependencies = { ...(manifest.devDependencies ?? {}), ...devDeps }
    if (!Object.keys(manifest.dependencies).length) delete manifest.dependencies
    if (!Object.keys(manifest.devDependencies).length) delete manifest.devDependencies

    await Bun.write(join(target.dir, 'package.json'), JSON.stringify(manifest, null, 2) + '\n')
    return { deps, devDeps }
  }

  /** Persists the version cache to disk if it changed. */
  async flush(): Promise<void> {
    if (this.dirty) await Bun.write(this.cachePath, JSON.stringify(this.cache, null, 2) + '\n')
  }

  private async version(name: string): Promise<string> {
    const cached = this.cache[name]
    if (cached) return cached

    const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}`)
    const data = (await res.json()) as { 'dist-tags'?: { latest?: string } }
    const latest = data['dist-tags']?.latest
    if (!latest) throw new Error(`scaffold: no stable version found for "${name}"`)

    const spec = `^${latest}`
    this.cache[name] = spec
    this.dirty = true
    return spec
  }
}

/** Author files, captured before syncFiles persists/rewrites them. */
function collectTargets(project: Project): ScaffoldTarget[] {
  const targets: ScaffoldTarget[] = project.packages.map((p) => ({
    name: p.name,
    dir: p.dir,
    isNew: p.isNew ?? false,
    files: [...p.files],
  }))
  if (project.files.length) {
    targets.push({
      name: project.name,
      dir: project.dir,
      isNew: project.isNew ?? false,
      files: [...project.files],
    })
  }
  return targets
}

async function hydrateNew(project: Project, targets: ScaffoldTarget[]): Promise<void> {
  const templates = join(import.meta.dir, 'templates')

  if (project.isNew) {
    await hydrate(join(templates, 'typescript-monorepo.tpl'), project.dir, {
      PROJECT_NAME: project.name,
    })
  }

  for (const target of targets) {
    if (!target.isNew) continue
    const type = detectPackageType(target.files)
    await hydrate(join(templates, `${type}.tpl`), target.dir, {
      PROJECT_NAME: project.name,
      PACKAGE_NAME: target.name,
    })
  }
}

export async function prepareTypescript(
  contents: string[],
  opts: ScaffoldOptions,
): Promise<PreparedProject | null> {
  const project = prepare(contents, opts)
  if (!project) return null

  project.isNew = !existsSync(project.dir)
  for (const pkg of project.packages) pkg.isNew = !existsSync(pkg.dir)

  // Snapshot author files before syncFiles persists/rewrites them.
  const targets = collectTargets(project)

  project.files = await syncFiles(project.files)
  for (const pkg of project.packages) pkg.files = await syncFiles(pkg.files)

  await hydrateNew(project, targets)

  const resolver = new DependencyResolver(new Set(project.packages.map((p) => p.name)))

  let installNeeded = false
  for (const target of targets) {
    const resolved = await resolver.resolve(target)
    if (resolved) installNeeded = true

    const pkg = project.packages.find((p) => p.name === target.name)
    if (pkg) {
      pkg.deps = resolved?.deps ?? {}
      pkg.devDeps = resolved?.devDeps ?? {}
    }
  }

  await resolver.flush()

  if (installNeeded) {
    const res = await bash(['bun', 'install'], { cwd: project.dir })
    if (res.exitCode !== 0) {
      throw new Error(`scaffold: bun install failed in ${project.dir}:\n${res.stderr}`)
    }
  }

  return {
    name: project.name,
    dir: project.dir,
    isNew: project.isNew ?? false,
    files: [...project.files, ...project.packages.flatMap((p) => p.files)],
  }
}