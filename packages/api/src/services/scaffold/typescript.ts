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
import { existsSync } from 'fs'
import { bash } from '../../utils/bash'
import { prepare } from './prepare'
import { hydrate } from './hydrate'
import { syncFiles } from './shared'
import {postProcessPackageFiles} from "./postProcessPackageFiles.ts"
import { DependencyResolver } from './deps'
import type { ScaffoldTarget } from './deps'
import type { ScaffoldOptions, FileEntry, PreparedProject } from './types'

type PkgType = 'astro' | 'react' | 'typescript'
type Project = NonNullable<ReturnType<typeof prepare>>

  const resolver = new DependencyResolver()


function detectPackageType(files: FileEntry[]): PkgType {
  const exts = new Set(files.map((f) => extname(f.path)))
  if (exts.has('.astro')) return 'astro'
  if (exts.has('.tsx') || exts.has('.jsx')) return 'react'
  return 'typescript'
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
  for (const pkg of project.packages) {
    pkg.files = await syncFiles(pkg.files)
    await postProcessPackageFiles(pkg)
  }

  

  await hydrateNew(project, targets)


  let installNeeded = false
  for (const target of targets) {
    const resolved = await resolver.resolve(project.name, target)
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
    console.log('install', res)
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