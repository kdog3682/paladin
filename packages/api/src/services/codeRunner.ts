import { dirname, extname } from 'path'
import { bash } from '@paladin/utils/bash'
import { fastDependencyList } from '@paladin/utils/fastDependencyList'
import { webrun } from './webrun'
import { demonstrater } from './demonstrater'
import {clip} from "@paladin/utils"
import { test as testCodemod } from '@paladin/codemod/test'
import type { FileEntry } from './scaffold/types'

type Kind = 'demo' | 'example' | 'script' | 'test'
type RunType = Kind | 'web-demo' | 'codemod'

const TRANSFORM_FILE = /\/codemod\/src\/transforms\/([^/]+)\.ts$/

export interface RunResult {
  type: RunType
  sourceFile: string
  result: Record<string, unknown>
}

// living cache: runnable file -> its dependency files
const depCache = new Map<string, Set<string>>()

function classify(path: string): RunType | null {
  const p = path.replace(/\\/g, '/')
  if (TRANSFORM_FILE.test(p)) return 'codemod'
  // if (CORPUS_FILE.test(p)) return 'corpus'
  const match = p.match(
    /\.(demo|example|script|test)\.|\/(demos|examples|scripts|tests)\/|(?:^|\/)(demo|example|script|test)\.[^/]+$/,
  )
  if (!match) return null
  const kind = (match[1] ?? match[3] ?? match[2]!.slice(0, -1)) as Kind
  return kind === 'demo' && extname(p) === '.tsx' ? 'web-demo' : kind
}

async function index(file: string): Promise<void> {
  const deps = await fastDependencyList(file)
  depCache.set(file, new Set(deps))
}

function dependents(file: string): string[] {
  const out: string[] = []
  for (const [runnable, deps] of depCache) {
    if (deps.has(file)) out.push(runnable)
  }
  return out
}

async function run(file: string, type: RunType): Promise<RunResult> {
  let result: unknown
  if (type === 'web-demo') {
    result = await webrun(file)
  } else if (type === 'codemod') {
    const name = file.replace(/\\/g, '/').match(TRANSFORM_FILE)![1]
    try {

    const summary = await testCodemod([name])
    await clip(summary)
    result = summary
    } catch(e) {
      await clip(e.toString())
    }
  } else if (type === 'example') {
    result = await demonstrater(file)
    }
    else if (type == 'test') {

    result = await bash(['bun', 'test', file], { cwd: dirname(file) })
    }
  else {
    result = await bash(['bun', file], { cwd: dirname(file) })
  }
  return { type, sourceFile: file, result: result as Record<string, unknown> }
}

export async function codeRunner(files: FileEntry[]): Promise<RunResult[]> {
  const paths = files.map((f) => f.path)
  const pending = new Map<string, RunType>()
  for (const path of paths) {
    const type = classify(path)
    // scripts never index — they just run when they appear
    if (type === 'script') {
      pending.set(path, 'script')
      continue
    }

    // a runnable appearing means created/changed -> reindex + run
    if (type) {
      await index(path)
      pending.set(path, type)
      continue
    }

    // plain file: rerun any runnable that depends on it (batched by the map)
    for (const runnable of dependents(path)) {
      const runnableType = classify(runnable)
      if (runnableType) pending.set(runnable, runnableType)
    }
  }

  const entries = [...pending].sort(([, a], [, b]) => (a === 'script' ? -1 : b === 'script' ? 1 : 0))

  const results: RunResult[] = []
  for (const [file, type] of entries) {
    results.push(await run(file, type))
  }
  return results
}


