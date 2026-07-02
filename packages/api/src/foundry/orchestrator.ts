// Replaces the old prepareTypescript tail. Reuses the existing scaffold plumbing
// (prepare / syncFiles / hydrateNew / collectTargets / DependencyResolver) and
// layers the foundry state model on top: builds reconciled FileNodeInternal[]
// and assembles them into the new ProjectData tree.

import { existsSync } from 'fs'
import { expandHome } from '../../utils/path'
import { bash } from '../../utils/bash'
import { prepare } from './prepare'
import { syncFiles } from './shared'
import { hydrateNew, collectTargets, DependencyResolver } from './scaffold'
import { buildProject, type BuildTarget } from './nodes'
import { loadBaseline } from './reconcile'
import { packageDisplayName, projectDisplayName } from './paths'
import type { ProjectData, FileNodeInternal } from './types'

export interface FoundryOptions {
  baseProjectDir: string
}

const DEFAULTS: FoundryOptions = { baseProjectDir: '~/projects' }

export async function prepareTypescript(
  contents: string[],
  opts: FoundryOptions = DEFAULTS,
): Promise<ProjectData | null> {
  const base = expandHome(opts.baseProjectDir)

  const project = prepare(contents, opts)
  if (!project) return null

  project.isNew = !existsSync(project.dir)
  for (const pkg of project.packages) pkg.isNew = !existsSync(pkg.dir)

  // Snapshot author files (with content) before syncFiles rewrites project.files
  // to just the changed subset. Also capture per-file newness here — it must be
  // read before the writes below land.
  const targets = collectTargets(project)
  const wasNew = new Map<string, boolean>()
  for (const t of targets) {
    for (const f of t.files) wasNew.set(f.path, !existsSync(f.path))
  }

  // Persist author files, hydrate templates for new dirs.
  project.files = await syncFiles(project.files)
  for (const pkg of project.packages) pkg.files = await syncFiles(pkg.files)
  await hydrateNew(project, targets)

  // Resolve deps (writes each package.json), install only if something new.
  const resolver = new DependencyResolver(new Set(project.packages.map((p) => p.name)))
  let installNeeded = false
  for (const target of targets) {
    if (await resolver.resolve(target)) installNeeded = true
  }
  await resolver.flush()

  if (installNeeded) {
    const res = await bash(['bun', 'install'], { cwd: project.dir })
    if (res.exitCode !== 0) {
      throw new Error(`foundry: bun install failed in ${project.dir}:\n${res.stderr}`)
    }
  }

  // Build reconciled nodes from the snapshot, then assemble the tree. deps are
  // resolved by now, so externalKey reads final package.json versions.
  const buildTargets: BuildTarget[] = targets.map((t) => ({
    dir: t.dir,
    files: t.files.map((f) => ({ path: f.path, content: f.content, isNew: wasNew.get(f.path) ?? true })),
  }))

  const baseline = await loadBaseline(project.name)
  const nodes = await buildProject(buildTargets, base, baseline)

  return assembleTree(project, nodes)
}

// Groups flat nodes back into the ProjectData tree by matching each node's path
// against the known package dirs; everything else is a root file.
function assembleTree(
  project: NonNullable<ReturnType<typeof prepare>>,
  nodes: FileNodeInternal[],
): ProjectData {
  const byPkg = new Map<string, FileNodeInternal[]>()
  const rootFiles: FileNodeInternal[] = []

  for (const node of nodes) {
    const pkg = project.packages.find((p) => node.path.startsWith(p.dir + '/'))
    if (pkg) {
      const bucket = byPkg.get(pkg.dir) ?? []
      bucket.push(node)
      byPkg.set(pkg.dir, bucket)
    } else {
      rootFiles.push(node)
    }
  }

  return {
    name: project.name,
    path: project.dir,
    displayName: projectDisplayName(project.name),
    isNew: project.isNew ?? false,
    files: rootFiles,
    packages: project.packages.map((p) => ({
      path: p.dir,
      displayName: packageDisplayName(project.name, p.name),
      isNew: p.isNew ?? false,
      files: byPkg.get(p.dir) ?? [],
    })),
  }
}
