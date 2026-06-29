import { existsSync } from 'fs'
import { basename, dirname, extname } from 'path'
import { bash, type BashResult } from '../utils/bash'
import type { FileEntry } from './scaffold/types'

async function runTypst(file: string): Promise<BashResult> {
  const pdfPath = '/home/kdog3682/scratch/typst.svg'
  const result = await bash(['typst', 'compile', '--format=svg', file, pdfPath], { cwd: dirname(file) })
  if (result.exitCode === 0) {
    await bash(['python3', '-c', `import webbrowser; webbrowser.open('file://${pdfPath}')`])
  }
  return result
}

const PAIR_INFIXES = ['demo', 'test', 'e2e', 'script']

function classify(path: string): 'demo' | 'test' | 'script' | null {
  const p = path.replace(/\\/g, '/')
  const stem = basename(p, extname(p)).toLowerCase()
  if (['demo', 'example', 'sample', 'playground', 'scratch'].includes(stem)) return 'demo'
  if (/\.demo\./.test(p)) return 'demo'
  if (/\.test\./.test(p) || /\.e2e\./.test(p) || p.includes('/tests/') || p.includes('/__tests__/')) return 'test'
  if (/\.script\./.test(p) || p.includes('/scripts/')) return 'script'
  return null
}

function findPair(path: string): string | null {
  const ext = extname(path)
  const stem = path.slice(0, -ext.length)
  for (const infix of PAIR_INFIXES) {
    const candidate = `${stem}.${infix}${ext}`
    if (existsSync(candidate)) return candidate
  }
  return null
}

async function run(file: string, type: 'demo' | 'test' | 'script'): Promise<BashResult> {
  if (extname(file) === '.typ') return runTypst(file)
  const args = type === 'test' ? ['bun', 'test', file] : ['bun', file]
  return bash(args, { cwd: dirname(file) })
}

export async function codeRunner(files: FileEntry[]): Promise<BashResult[]> {
  const results: BashResult[] = []
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
