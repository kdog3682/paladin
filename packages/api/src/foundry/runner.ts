// Run-result store + execution. Results are content-addressed by cacheKey, so
// they're valid across sessions and survive edit-and-revert for free: revert a
// file and its cacheKey returns to the old value, re-hitting the old result. A
// cache miss means the file, its local closure, or a dep actually changed.

import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'
import { expandHome } from '../../utils/path'
import { isRunnable } from './types'
import type { CodeExecutionResult, FileNodeInternal, Output, RunResult } from './types'

const RESULTS_DIR = expandHome('~/.paladin/system/foundry/results')
const MAX_RESULTS = 500 // evict oldest beyond this on save

// A run declares any image/pdf/text output by printing one sentinel line:
//   console.log('__FOUNDRY_OUTPUT__' + JSON.stringify({ type:'image', url }))
// so runCode never has to scan the filesystem for artifacts.
const OUTPUT_SENTINEL = '__FOUNDRY_OUTPUT__'

function parseOutput(stdout: string): Output | undefined {
  let found: Output | undefined
  for (const line of stdout.split('\n')) {
    const at = line.indexOf(OUTPUT_SENTINEL)
    if (at === -1) continue
    try {
      found = JSON.parse(line.slice(at + OUTPUT_SENTINEL.length).trim()) as Output
    } catch {
      // malformed sentinel — ignore, keep any earlier valid one
    }
  }
  return found
}

// Executes a file via bun and captures the outcome. The default Executor.
export async function runCode(args: string[], cwd: string): Promise<CodeExecutionResult> {
  const proc = Bun.spawn(args, { cwd, stdout: 'pipe', stderr: 'pipe' })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  return { exitCode, stdout, stderr, args, output: parseOutput(stdout) }
}

// Runs a file and returns the raw execution result. Injectable so tests (and
// alternate runtimes) can swap it.
export type Executor = (args: string[], cwd: string) => Promise<CodeExecutionResult>

const defaultExecutor: Executor = runCode

export interface RunOptions {
  force?: boolean // bypass the cache and always execute
}

// Ties an output asset to the exact content that produced it. The backend may
// reuse a URL when it regenerates output; without a version token the browser/
// CDN would serve the stale asset. cacheKey is content-addressed, so revert
// lands on the identical versioned URL and re-hits.
function versionOutput(output: Output | undefined, token: string): Output | undefined {
  if (!output || output.type === 'text') return output
  const sep = output.url.includes('?') ? '&' : '?'
  return { ...output, url: `${output.url}${sep}v=${token}` }
}

export class RunStore {
  private results = new Map<string, RunResult>()

  // dir + executor are injectable so tests don't touch the real store or spawn
  // a runtime.
  constructor(
    private readonly project: string,
    private readonly dir: string = RESULTS_DIR,
    private readonly executor: Executor = defaultExecutor,
  ) {}

  private storePath(): string {
    return join(this.dir, `${this.project}.json`)
  }

  async load(): Promise<void> {
    const path = this.storePath()
    if (!existsSync(path)) return
    const raw = JSON.parse(await Bun.file(path).text()) as Record<string, RunResult>
    this.results = new Map(Object.entries(raw))
  }

  // Persists, keeping the most-recent MAX_RESULTS. Old keys are kept beyond the
  // live node set on purpose — that's what makes edit-and-revert re-hit.
  async save(): Promise<void> {
    if (!existsSync(this.dir)) mkdirSync(this.dir, { recursive: true })
    const trimmed = [...this.results.entries()]
      .sort(([, a], [, b]) => b.ranAt - a.ranAt)
      .slice(0, MAX_RESULTS)
    await Bun.write(this.storePath(), JSON.stringify(Object.fromEntries(trimmed), null, 2) + '\n')
  }

  // For toWire's hasResult: does this node have a cached result?
  hasResult(node: FileNodeInternal): boolean {
    return node.cacheKey ? this.results.has(node.cacheKey) : false
  }

  get(cacheKey: string): RunResult | undefined {
    return this.results.get(cacheKey)
  }

  // Runs a node, honoring the cache unless force. Cached hits return instantly.
  async run(node: FileNodeInternal, cwd: string, opts: RunOptions = {}): Promise<RunResult> {
    if (!isRunnable(node.kind)) throw new Error(`foundry: ${node.kind} is not runnable: ${node.path}`)
    if (!node.cacheKey) throw new Error(`foundry: node has no cacheKey: ${node.path}`)

    if (!opts.force) {
      const cached = this.results.get(node.cacheKey)
      if (cached) return cached
    }

    const args = node.kind === 'test' ? ['bun', 'test', node.path] : ['bun', node.path]
    const ranAt = Date.now()
    const exec = await this.executor(args, cwd)
    const result: RunResult = {
      ...exec,
      output: versionOutput(exec.output, node.cacheKey),
      ranAt,
      durationMs: Date.now() - ranAt,
    }
    this.results.set(node.cacheKey, result)
    return result
  }

  // The watch/emit primitive. After a rebuild, run() executes only the nodes
  // whose cacheKey moved (miss) and returns the rest from cache. Non-runnable
  // nodes are skipped. Keyed by node path for the caller. Sequential by design
  // — parallelism is a knob to add if demo suites get slow.
  async runStale(
    nodes: FileNodeInternal[],
    cwd: string,
    opts: RunOptions = {},
  ): Promise<Map<string, RunResult>> {
    const out = new Map<string, RunResult>()
    for (const node of nodes) {
      if (!isRunnable(node.kind) || !node.cacheKey) continue
      out.set(node.path, await this.run(node, cwd, opts))
    }
    return out
  }
}
