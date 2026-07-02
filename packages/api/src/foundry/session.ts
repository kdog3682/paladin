// Live project state + the event bus the server broadcasts. No filesystem
// watching here — ingestion is driven by processFile (a downloaded file lands,
// the server calls it). On each ingest we reconcile against the baseline and,
// if autoRun is on, rerun stale runnables. runStale already skips cache hits and
// runs only moved-key files, so a changed source reruns exactly the runnables
// whose closure it touched (foobar.test.ts reruns on a foobar.ts edit because it
// imports it) — no reverse-dependency bookkeeping needed.

import { RunStore, type RunOptions } from './runner'
import {
  reconcile,
  loadBaseline,
  saveBaseline,
  stage as stageBaseline,
  unstage as unstageBaseline,
  commit as commitBaseline,
  type Baseline,
} from './reconcile'
import { isRunnable, toWireTree } from './types'
import type { FileNodeInternal, ProjectData, RunResult, WireProject } from './types'

export type FoundryEvent =
  | { type: 'tree'; tree: WireProject }
  | { type: 'result'; path: string; result: RunResult }

// The bus. The server wires broadcast in via onEvent; everything the session
// produces flows through here.
let emit: (event: FoundryEvent) => void = () => {}
export function onEvent(cb: (event: FoundryEvent) => void): void {
  emit = cb
}

class FoundrySession {
  private tree: ProjectData | null = null
  private index = new Map<string, FileNodeInternal>()
  private baseline: Baseline = { hashes: {}, staged: [] }
  private projectName = ''
  private store: RunStore | null = null
  private autoRun = false

  private get cwd(): string {
    return this.tree?.path ?? process.cwd()
  }

  // Adopts a freshly-scaffolded tree, reconciles it, emits, and (if autoRun)
  // reruns stale runnables. This is the cascade entry called by processFile.
  async ingest(tree: ProjectData): Promise<void> {
    if (tree.name !== this.projectName || !this.store) {
      this.projectName = tree.name
      this.store = new RunStore(tree.name)
      await this.store.load()
    }

    this.tree = tree
    this.index = indexOf(tree)
    this.baseline = await loadBaseline(tree.name)
    reconcile([...this.index.values()], this.baseline)
    this.emitTree()

    if (this.autoRun) await this.runAll()
  }

  // Manual trigger from the frontend. force bypasses the cache.
  async executeFile(path: string, opts: RunOptions = {}): Promise<RunResult> {
    const node = this.require(path)
    if (!isRunnable(node.kind)) throw new Error(`foundry: ${node.displayName} is not runnable`)
    if (!node.cacheKey) throw new Error(`foundry: ${node.displayName} has no cacheKey`)
    if (!this.store) throw new Error('foundry: no project loaded')

    const result = await this.store.run(node, this.cwd, opts)
    emit({ type: 'result', path, result })
    await this.store.save()
    return result
  }

  async stage(paths: string[]): Promise<void> {
    this.baseline = stageBaseline(this.baseline, paths)
    await this.persist()
  }

  async unstage(paths: string[]): Promise<void> {
    this.baseline = unstageBaseline(this.baseline, paths)
    await this.persist()
  }

  // Promotes files to "known good": folds their hashes into the baseline so they
  // read clean until edited again.
  async commit(paths: string[]): Promise<void> {
    const nodes = paths.map((p) => this.index.get(p)).filter((n): n is FileNodeInternal => !!n)
    this.baseline = commitBaseline(this.baseline, nodes)
    await this.persist()
  }

  // Watch mode: when on, ingested changes rerun their stale runnables.
  setAutoRun(on: boolean): void {
    this.autoRun = on
  }

  private async runAll(): Promise<void> {
    if (!this.store) return
    const runnables = [...this.index.values()].filter((n) => isRunnable(n.kind))
    const results = await this.store.runStale(runnables, this.cwd)
    for (const [path, result] of results) emit({ type: 'result', path, result })
    await this.store.save()
  }

  private async persist(): Promise<void> {
    await saveBaseline(this.projectName, this.baseline)
    reconcile([...this.index.values()], this.baseline)
    this.emitTree()
  }

  private emitTree(): void {
    if (!this.tree) return
    emit({ type: 'tree', tree: toWireTree(this.tree, (n) => this.store?.hasResult(n) ?? false) })
  }

  private require(path: string): FileNodeInternal {
    const node = this.index.get(path)
    if (!node) throw new Error(`foundry: unknown file ${path}`)
    return node
  }
}

function indexOf(tree: ProjectData): Map<string, FileNodeInternal> {
  const idx = new Map<string, FileNodeInternal>()
  for (const n of tree.files) idx.set(n.path, n)
  for (const p of tree.packages) for (const n of p.files) idx.set(n.path, n)
  return idx
}

export const session = new FoundrySession()
