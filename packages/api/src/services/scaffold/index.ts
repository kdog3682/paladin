import { join, extname } from 'path'
import { existsSync } from 'fs'
import { expandHome } from '../../../utils/path'
import { bash } from '../../../utils/bash'
import * as git from '../../../services/git'
import { prepare } from './prepare'
import { collectImports } from './imports'
import { hydrate } from './hydrate'
import type { ScaffoldOptions, ProjectData, FileEntry } from './types'

const NPM_DEPS_CACHE = expandHome('~/projects/paladin/npm-dependencies.json')

const DEFAULTS: ScaffoldOptions = {
  baseProjectDir: '~/projects',
  activeDir: null,
}

// only these carry resolvable imports; everything else (json, tpl, py, typ...)
// is skipped during dependency discovery
const IMPORT_EXTS = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'])

type PkgType = 'astro' | 'react' | 'typescript'

interface Unit {
  name: string
  dir: string
  files: FileEntry[]
  isNew: boolean
}

function detectPackageType(files: FileEntry[]): PkgType {
  const exts = files.map((f) => extname(f.path))
  if (exts.includes('.astro')) return 'astro'
  if (exts.includes('.tsx')) return 'react'
  return 'typescript'
}

// reads file contents from a single source file or a .zip (read, not extracted).
export async function readInputs(file: string): Promise<string[]> {
  if (file.endsWith('.zip')) {
    const { unzipSync, strFromU8 } = await import('fflate')
    const buf = new Uint8Array(await Bun.file(file).arrayBuffer())
    const entries = unzipSync(buf)
    return Object.values(entries).map((u8) => strFromU8(u8))
  }
  return [await Bun.file(file).text()]
}

// writes changed files, skips ones whose content already matches disk.
// returns only the files that were actually written.
async function syncFiles(files: FileEntry[]): Promise<FileEntry[]> {
  const changed: FileEntry[] = []
  for (const f of files) {
    if (existsSync(f.path) && (await Bun.file(f.path).text()) === f.content) continue
    await Bun.write(f.path, f.content)
    changed.push(f)
  }
  return changed
}

// resolves a stable (non-prerelease) version for an external package and
// caches it. stable = npm dist-tags.latest, pinned with a caret.
async function resolveVersion(name: string, cache: Record<string, string>): Promise<string> {
  if (cache[name]) return cache[name]
  const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}`)
  const data = (await res.json()) as { 'dist-tags'?: { latest?: string } }
  const stable = data['dist-tags']?.latest
  if (!stable) throw new Error(`scaffold: no stable version found for "${name}"`)
  const spec = `^${stable}`
  cache[name] = spec
  return spec
}

// adds any missing dependencies to a unit's package.json (never overwrites).
async function updateManifest(dir: string, deps: Record<string, string>): Promise<void> {
  const pkgPath = join(dir, 'package.json')
  const json: any = existsSync(pkgPath) ? JSON.parse(await Bun.file(pkgPath).text()) : {}
  const existing: Record<string, string> = json.dependencies ?? {}
  for (const [name, ver] of Object.entries(deps)) {
    if (!(name in existing)) existing[name] = ver
  }
  json.dependencies = existing
  await Bun.write(pkgPath, JSON.stringify(json, null, 2) + '\n')
}

export async function scaffold(
  file: string,
  config: Partial<ScaffoldOptions> = {},
): Promise<ProjectData | null> {
  const contents = await readInputs(expandHome(file))
  return scaffoldFromContents(contents, config)
}

export async function scaffoldFromContents(
  contents: string[],
  config: Partial<ScaffoldOptions> = {},
): Promise<ProjectData | null> {
  const opts: ScaffoldOptions = { ...DEFAULTS, ...config }

  const project = prepare(contents, opts)
  if (!project) return null
  if (project.error) return project // path resolution needs user input; stop here

  // isNew is decided here, on disk (prepare leaves it null)
  project.isNew = !existsSync(project.dir)
  for (const pkg of project.packages) pkg.isNew = !existsSync(pkg.dir)

  // skip unchanged files, write the rest
  project.files = await syncFiles(project.files)
  for (const pkg of project.packages) pkg.files = await syncFiles(pkg.files)

  // owners of a package.json: each package, plus the project root when it holds
  // files directly (single-project / app layout)
  const units: Unit[] = project.packages.map((p) => ({
    name: p.name,
    dir: p.dir,
    files: p.files,
    isNew: p.isNew ?? false,
  }))
  if (project.files.length) {
    units.push({ name: project.name, dir: project.dir, files: project.files, isNew: project.isNew ?? false })
  }

  // monorepo root scaffolding for a brand-new project
  if (project.isNew) {
    await hydrate(join(import.meta.dir, 'templates', 'typescript-monorepo.tpl'), project.dir, {
      PROJECT_NAME: project.name,
      PACKAGE_NAME: project.name,
    })
  }

  // boilerplate hydration — only for new units; never overwrites presented files
  for (const unit of units) {
    if (!unit.isNew) continue
    const type = detectPackageType(unit.files)
    const templatePath = join(import.meta.dir, 'templates', `${type}.tpl`)
    await hydrate(templatePath, unit.dir, { PROJECT_NAME: project.name, PACKAGE_NAME: unit.name })
  }

  // manifest / dependency resolution (npm version cache)
  const cache: Record<string, string> = existsSync(NPM_DEPS_CACHE)
    ? JSON.parse(await Bun.file(NPM_DEPS_CACHE).text())
    : {}
  let cacheDirty = false

  const pkgNames = new Set(project.packages.map((p) => p.name))

  for (const unit of units) {
    const roots = new Set<string>()
    for (const f of unit.files) {
      if (!IMPORT_EXTS.has(extname(f.path))) continue // non-ts files carry no deps
      for (const root of await collectImports(f.content)) roots.add(root)
    }

    const deps: Record<string, string> = {}
    for (const root of roots) {
      const workspaceName = root.startsWith('@') ? root.split('/')[1] : null
      if (workspaceName && pkgNames.has(workspaceName)) {
        if (workspaceName === unit.name) continue // don't depend on self
        deps[root] = 'workspace:*'
      } else {
        const before = cache[root]
        deps[root] = await resolveVersion(root, cache)
        if (cache[root] !== before) cacheDirty = true
      }
    }

    if (Object.keys(deps).length) await updateManifest(unit.dir, deps)
  }

  if (cacheDirty) await Bun.write(NPM_DEPS_CACHE, JSON.stringify(cache, null, 2) + '\n')

  // bun init — once, at the project root, for new projects only
  if (project.isNew) {
    const res = await bash(['bun', 'init', '-y'], { cwd: project.dir })
    if (res.exitCode !== 0) {
      project.error = {
        type: 'bunInit',
        message: `bun init failed (exit ${res.exitCode})`,
        data: { exitCode: res.exitCode, stderr: res.stderr, args: res.args },
      }
      return project
    }
  }

  // git init — defaults to true for a new project
  const wantGit = opts.git ?? project.isNew
  if (wantGit) {
    await git.setRepo(project.dir)
    await git.initRepo()
  }

  // git remote repository — defaults to true for a new project
  // TODO: enable remote creation (hits GitHub / network)
  // const wantRemote = opts.remote ?? project.isNew
  // if (wantRemote) {
  //   await git.setRepo(project.dir)
  //   await git.initRemoteRepo()
  // }

  return project
}
