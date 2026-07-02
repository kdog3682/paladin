// The git-status verdict. Baseline = everything foundry has authored/committed
// (path -> hash), persisted across runs. A node is `created` if foundry has
// never committed it, `modified` if its hash moved, else `clean`. Files foundry
// never authored are outside this model — no scan, no claims about them.

import { join, dirname } from 'path'
import { existsSync, mkdirSync } from 'fs'
import { expandHome } from '../../utils/path'
import type { FileNodeInternal, GitStatus } from './types'

const STATE_DIR = expandHome('~/.paladin/system/foundry')

// Committed hashes + the staged set, collapsed from git's HEAD/index.
export interface Baseline {
  hashes: Record<string, string>
  staged: string[]
}

const baselinePath = (project: string): string => join(STATE_DIR, `${project}.json`)

export async function loadBaseline(project: string): Promise<Baseline> {
  const path = baselinePath(project)
  if (!existsSync(path)) return { hashes: {}, staged: [] }
  return JSON.parse(await Bun.file(path).text()) as Baseline
}

export async function saveBaseline(project: string, baseline: Baseline): Promise<void> {
  if (!existsSync(STATE_DIR)) mkdirSync(STATE_DIR, { recursive: true })
  await Bun.write(baselinePath(project), JSON.stringify(baseline, null, 2) + '\n')
}

// Assigns git.status/staged to each node by diffing against the baseline.
// Mutates and returns the nodes.
export function reconcile(nodes: FileNodeInternal[], baseline: Baseline): FileNodeInternal[] {
  const staged = new Set(baseline.staged)
  for (const node of nodes) {
    node.git = { status: verdict(node, baseline), staged: staged.has(node.path) }
  }
  return nodes
}

function verdict(node: FileNodeInternal, baseline: Baseline): GitStatus {
  const prev = baseline.hashes[node.path]
  if (prev === undefined) return 'created'
  return prev === node.contentHash ? 'clean' : 'modified'
}

// Adds paths to the staging set.
export function stage(baseline: Baseline, paths: string[]): Baseline {
  return { ...baseline, staged: [...new Set([...baseline.staged, ...paths])] }
}

// Removes paths from the staging set.
export function unstage(baseline: Baseline, paths: string[]): Baseline {
  const drop = new Set(paths)
  return { ...baseline, staged: baseline.staged.filter((p) => !drop.has(p)) }
}

// Folds nodes into the committed baseline and clears them from staging. Call
// after a run/accept promotes author files to "known good".
export function commit(baseline: Baseline, nodes: FileNodeInternal[]): Baseline {
  const hashes = { ...baseline.hashes }
  const committed = new Set<string>()
  for (const node of nodes) {
    hashes[node.path] = node.contentHash
    committed.add(node.path)
  }
  return { hashes, staged: baseline.staged.filter((p) => !committed.has(p)) }
}
