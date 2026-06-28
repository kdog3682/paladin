import { join, extname } from 'path'
import { existsSync } from 'fs'
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

function isTestFile(path: string): boolean {
  return /\.(test|spec)\.[jt]sx?$/.test(path) || /(?:^|\/)(test|__tests__)\//.test(path)
}

function detectPackageType(files: FileEntry[]): PkgType {
  const exts = new Set(files.map((f) => extname(f.path)))
  if (exts.has('.astro')) return 'astro'
  if (exts.has('.tsx') || exts.has('.jsx')) return 'react'
  return 'typescript'
}

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

async function updateManifest(
  dir: string,
  deps: Record<string, string>,
  devDeps: Record<string, string>,
): Promise<void> {
  const pkgPath = join(dir, 'package.json')
  const json: any = existsSync(pkgPath) ? JSON.parse(await Bun.file(pkgPath).text()) : {}
  const existing: Record<string, string> = json.dependencies ?? {}
  const existingDev: Record<string, string> = json.devDependencies ?? {}
  for (const [name, ver] of Object.entries(deps)) {
    if (!(name in existing)) existing[name] = ver
  }
  for (const [name, ver] of Object.entries(devDeps)) {
    if (!(name in existingDev)) existingDev[name] = ver
  }
  if (Object.keys(existing).length) json.dependencies = existing
  if (Object.keys(existingDev).length) json.devDependencies = existingDev
  await Bun.write(pkgPath, JSON.stringify(json, null, 2) + '\n')
}

export async function prepareTypescript(contents: string[], opts: ScaffoldOptions): Promise<PreparedProject | null> {
  const project = prepare(contents, opts)
  if (!project) return null

  project.isNew = !existsSync(project.dir)
  for (const pkg of project.packages) pkg.isNew = !existsSync(pkg.dir)

  const originalProjectFiles = [...project.files]
  const originalPkgFiles = new Map(project.packages.map((p) => [p, [...p.files]]))

  project.files = await syncFiles(project.files)
  for (const pkg of project.packages) pkg.files = await syncFiles(pkg.files)

  interface Unit {
    name: string
    dir: string
    presentedFiles: FileEntry[]
    writtenFiles: FileEntry[]
    isNew: boolean
  }

  const units: Unit[] = project.packages.map((p) => ({
    name: p.name,
    dir: p.dir,
    presentedFiles: originalPkgFiles.get(p)!,
    writtenFiles: p.files,
    isNew: p.isNew ?? false,
  }))
  if (originalProjectFiles.length) {
    units.push({
      name: project.name,
      dir: project.dir,
      presentedFiles: originalProjectFiles,
      writtenFiles: project.files,
      isNew: project.isNew ?? false,
    })
  }

  if (project.isNew) {
    await hydrate(join(import.meta.dir, 'templates', 'typescript-monorepo.tpl'), project.dir, {
      PROJECT_NAME: project.name,
    })
  }

  for (const unit of units) {
    if (!unit.isNew) continue
    const type = detectPackageType(unit.presentedFiles)
    const templatePath = join(import.meta.dir, 'templates', `${type}.tpl`)
    await hydrate(templatePath, unit.dir, { PROJECT_NAME: project.name, PACKAGE_NAME: unit.name })
  }

  const cache: Record<string, string> = existsSync(NPM_DEPS_CACHE)
    ? JSON.parse(await Bun.file(NPM_DEPS_CACHE).text())
    : {}
  let cacheDirty = false
  let depsUpdated = false

  const pkgNames = new Set(project.packages.map((p) => p.name))

  for (const unit of units) {
    const deps: Record<string, string> = {}
    const devDeps: Record<string, string> = {}

    for (const f of unit.presentedFiles) {
      if (!IMPORT_EXTS.has(extname(f.path))) continue
      const target = isTestFile(f.path) ? devDeps : deps
      for (const root of await collectImports(f.content)) {
        const workspaceName = root.startsWith('@') ? root.split('/')[1] : null
        if (workspaceName && pkgNames.has(workspaceName)) {
          if (workspaceName === unit.name) continue
          target[root] = 'workspace:*'
        } else {
          const before = cache[root]
          target[root] = await resolveVersion(root, cache)
          if (cache[root] !== before) cacheDirty = true
        }
      }
    }

    if (Object.keys(deps).length || Object.keys(devDeps).length) {
      await updateManifest(unit.dir, deps, devDeps)
      depsUpdated = true
    }

    const pkg = project.packages.find((p) => p.name === unit.name)
    if (pkg) {
      pkg.deps = deps
      pkg.devDeps = devDeps
    }
  }

  if (cacheDirty) await Bun.write(NPM_DEPS_CACHE, JSON.stringify(cache, null, 2) + '\n')

  if (depsUpdated) {
    const installRes = await bash(['bun', 'install'], { cwd: project.dir })
    if (installRes.exitCode !== 0) throw new Error(`scaffold: bun install failed in ${project.dir}:\n${installRes.stderr}`)
  }

  const files = [...project.files, ...project.packages.flatMap((p) => p.files)]

  return {
    name: project.name,
    dir: project.dir,
    isNew: project.isNew ?? false,
    files,
  }
}
