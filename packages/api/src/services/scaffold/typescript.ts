import { join, extname } from 'path'
import { existsSync } from 'fs'
import { bash } from '@paladin/utils'
import { prepare } from './prepare'
import { hydrate } from './hydrate'
import { syncFiles } from './shared'
import {postProcessPackageFiles} from "./postProcessPackageFiles"
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

  const targets = collectTargets(project)

  project.files = await syncFiles(project.files)
  for (const pkg of project.packages) {
    pkg.files = await syncFiles(pkg.files)
    await postProcessPackageFiles(pkg)
  }

  await hydrateNew(project, targets)


  for (const target of targets) {
    await resolver.resolve(project.name, target)
  }

  const installNeeded = await resolver.flush()

  if (installNeeded) {
    await bash(['bun', 'install'], { cwd: project.dir, strict: true })
  }

  return project
}