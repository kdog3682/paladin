// Turns authored files into FileNodeInternal[]: classify, hash, derive cache
// keys for runnable files, reconcile git status. Runs AFTER files are on disk
// and deps are resolved — externalKey reads the final package.json, and the
// closure walk reads sources from disk.

import { join } from 'path'
import { existsSync } from 'fs'
import { hashContent } from './hash'
import { classifyKind } from './classify'
import { fileDisplayName } from './paths'
import { ClosureResolver } from './closure'
import { isRunnable } from './types'
import { reconcile, type Baseline } from './reconcile'
import type { FileNodeInternal } from './types'

export interface RawFile {
  path: string
  content: string
  isNew: boolean // did the file exist on disk before this session
}

export interface BuildTarget {
  dir: string // owns a package.json (project root or a package)
  files: RawFile[]
}

async function readExternalDeps(dir: string): Promise<Record<string, string>> {
  const path = join(dir, 'package.json')
  if (!existsSync(path)) return {}
  const m = JSON.parse(await Bun.file(path).text())
  return { ...(m.dependencies ?? {}), ...(m.devDependencies ?? {}) }
}

// Project-wide digest of external (non-workspace) deps as sorted name@version.
// Project-wide, not per-package, on purpose: a runnable in package A can import
// package B's source, and B upgrading a dep won't move any source hash. A
// project-wide key over-invalidates slightly (a dep bump anywhere busts every
// run) but never under-invalidates — over-invalidation just recomputes, whereas
// under-invalidation serves stale results. Workspace deps are excluded: they're
// local and already covered by the closure's file hashes.
export async function computeExternalKey(dirs: string[]): Promise<string> {
  const set = new Set<string>()
  for (const dir of dirs) {
    const deps = await readExternalDeps(dir)
    for (const [name, version] of Object.entries(deps)) {
      if (version !== 'workspace:*') set.add(`${name}@${version}`)
    }
  }
  return hashContent([...set].sort().join('|'))
}

// Builds and reconciles all nodes for a project. base is the projects root
// (~/projects). Returns a flat list — nodes carry absolute paths, so the caller
// reassembles the ProjectData tree by matching path to target dirs. One shared
// ClosureResolver so file hashes memoize across every closure walk.
export async function buildProject(
  targets: BuildTarget[],
  base: string,
  baseline: Baseline,
): Promise<FileNodeInternal[]> {
  const resolver = new ClosureResolver(base, await computeExternalKey(targets.map((t) => t.dir)))
  const nodes: FileNodeInternal[] = []

  for (const target of targets) {
    for (const file of target.files) {
      const kind = classifyKind(file.path)
      const node: FileNodeInternal = {
        path: file.path,
        displayName: fileDisplayName(file.path, base),
        kind,
        isNew: file.isNew,
        contentHash: hashContent(file.content),
        git: { status: 'clean', staged: false }, // overwritten by reconcile
        // No stat: every node here is a file authored this session, so it's
        // genuinely fresh. An agent won't rewrite byte-identical content.
        modifiedAt: Date.now(),
      }
      if (isRunnable(kind)) node.cacheKey = await resolver.cacheKey(file.path)
      nodes.push(node)
    }
  }

  reconcile(nodes, baseline)
  return nodes
}
