import { join, relative, isAbsolute, basename, dirname } from 'path'
import { existsSync } from 'fs'
import { expandHome } from '@paladin/utils'
import type { File, Project, ScaffoldOptions, Unit } from '../types'

function within(dir: string, abs: string): boolean {
  const rel = relative(dir, abs)
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
}

/** The project root an absolute path belongs to: a child of base, the active dir, or its own parent. */
function projectDirFor(abs: string, opts: ScaffoldOptions): string {
  const base = expandHome(opts.base)
  if (within(base, abs)) return join(base, relative(base, abs).split('/')[0])

  const active = opts.relativeTo ? expandHome(opts.relativeTo) : null
  if (active && within(active, abs)) return active

  return dirname(abs)
}

/** Files under packages/<name>/ belong to that unit; everything else belongs to the root unit. */
function locate(abs: string, opts: ScaffoldOptions) {
  const projectDir = projectDirFor(abs, opts)
  const projectName = basename(projectDir)
  const [head, name, ...rest] = relative(projectDir, abs).split('/')

  if (head === 'packages' && name && name !== 'scripts' && rest.length) {
    return { projectName, projectDir, unitName: name, unitDir: join(projectDir, 'packages', name) }
  }

  return { projectName, projectDir, unitName: projectName, unitDir: projectDir }
}

/** Groups parsed files into a project tree. The first file decides the project. */
export function groupFiles(files: File[], opts: ScaffoldOptions): Project | null {
  if (files.length === 0) return null

  const first = locate(files[0].path, opts)
  const units = new Map<string, Unit>()

  for (const file of files) {
    const loc = locate(file.path, opts)
    let unit = units.get(loc.unitDir)
    if (!unit) {
      unit = { name: loc.unitName, dir: loc.unitDir, isNew: !existsSync(loc.unitDir), files: [] }
      units.set(loc.unitDir, unit)
    }
    unit.files.push(file)
  }

  return {
    name: first.projectName,
    dir: first.projectDir,
    isNew: !existsSync(first.projectDir),
    units: [...units.values()],
  }
}
