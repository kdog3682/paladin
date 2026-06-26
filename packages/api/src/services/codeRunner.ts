import { existsSync } from 'fs'
import { dirname, extname } from 'path'
import { bash } from '../../utils/bash'
import type { FileEntry, ScaffoldOptions } from './scaffold/types'

export interface RunResult {
  type: 'demo' | 'test' | 'script'
  file: string
  stdout: string
  stderr: string
}

// sibling infixes that mark a runnable counterpart for a plain source file
const PAIR_INFIXES = ['demo', 'test', 'e2e', 'script']

// classifies a path as runnable, or null if it isn't one
function classify(path: string): RunResult['type'] | null {
  const p = path.replace(/\\/g, '/')
  if (/\.demo\./.test(p)) return 'demo'
  if (/\.test\./.test(p) || /\.e2e\./.test(p) || p.includes('/tests/') || p.includes('/__tests__/')) return 'test'
  if (/\.script\./.test(p) || p.includes('/scripts/')) return 'script'
  return null
}

// for a plain file abc.ts, finds a sibling runnable pair like abc.test.ts
function findPair(path: string): string | null {
  const ext = extname(path)
  const stem = path.slice(0, -ext.length)
  for (const infix of PAIR_INFIXES) {
    const candidate = `${stem}.${infix}${ext}`
    if (existsSync(candidate)) return candidate
  }
  return null
}

async function run(file: string, type: RunResult['type']): Promise<RunResult> {
  const args = type === 'test' ? ['bun', 'test', file] : ['bun', file]
  const { stdout, stderr } = await bash(args, { cwd: dirname(file) })
  return { type, file, stdout, stderr }
}

// runs demos / tests / scripts found in the filestream, plus the matching pair
// of any plain file whose runnable counterpart exists on disk.
export async function codeRunner(
  files: FileEntry[],
  _opts?: Partial<ScaffoldOptions>,
): Promise<RunResult[]> {
  const results: RunResult[] = []
  const seen = new Set<string>()

  for (const f of files) {
    const direct = classify(f.path)
    if (direct) {
      if (!seen.has(f.path)) {
        seen.add(f.path)
        results.push(await run(f.path, direct))
      }
      continue
    }

    const pair = findPair(f.path)
    if (pair && !seen.has(pair)) {
      const type = classify(pair)
      if (type) {
        seen.add(pair)
        results.push(await run(pair, type))
      }
    }
  }

  return results
}
