// packages/api/src/utils/fs.ts
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises'
import path from 'node:path'
import fg from 'fast-glob'

export async function readFileSafe(file: string): Promise<any | null> {
  try {
    const raw = await readFile(file, 'utf8')
    return file.endsWith('.json') ? JSON.parse(raw) : raw
  } catch (err: any) {
    if (err?.code === 'ENOENT') return null
    throw err
  }
}

export async function writeFileSafe(file: string, content: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true })
  const out =
    file.endsWith('.json') && typeof content !== 'string'
      ? JSON.stringify(content)
      : String(content)
  await writeFile(file, out)
}

export async function waitForStable(
  filepath: string,
  interval = 200,
  maxWait = 5000,
): Promise<void> {
  let lastSize = -1
  let elapsed = 0
  while (elapsed < maxWait) {
    try {
      const { size } = await stat(filepath)
      if (size > 0 && size === lastSize) return
      lastSize = size
    } catch {
      // file may not exist yet
    }
    await new Promise((r) => setTimeout(r, interval))
    elapsed += interval
  }
}

const DEFAULT_IGNORE = [
  '**/.git/**',
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/.next/**',
  '**/.turbo/**',
  '**/.cache/**',
  '**/coverage/**',
]

export async function glob(
  dir: string,
  pattern: string | string[],
  options?: fg.Options,
): Promise<string[]> {
  return fg(pattern, {
    cwd: dir,
    ignore: [...DEFAULT_IGNORE, ...(options?.ignore ?? [])],
    ...options,
  })
}


// src/utils/getMostRecentFile.ts
import { readdir, stat } from 'fs/promises'
import { join, extname } from 'path'

function normalizeExt(ext?: string) {
  if (!ext) return null
  return ext.startsWith('.') ? ext : `.${ext}`
}

async function listFiles(dir: string, ext?: string) {
  const normExt = normalizeExt(ext)
  const entries = await readdir(dir)
  const files: { path: string; mtime: number }[] = []
  for (const name of entries) {
    if (normExt && extname(name) !== normExt) continue
    const path = join(dir, name)
    const s = await stat(path)
    if (!s.isFile() || s.size < 10) continue
    files.push({ path, mtime: s.mtimeMs })
  }

  return files.sort((a, b) => b.mtime - a.mtime)
}

export async function getMostRecentFile(dir: string, ext?: string): Promise<string | null> {
  const files = await listFiles(dir, ext)
  return files[0]?.path ?? null
}

/**
 * Returns the most recent group of files. Starting from the newest file,
 * includes any older files whose mtime is within `gapMs` of the previous one.
 */
export async function getMostRecentFileGroup(
  dir: string,
  opts: { ext?: string; gapMs?: number } = {}
): Promise<string[]> {
  const { ext, gapMs = 5000 } = opts
  const files = await listFiles(dir, ext)
  if (!files.length) return []

  const group = [files[0]]
  for (let i = 1; i < files.length; i++) {
    if (group[group.length - 1].mtime - files[i].mtime <= gapMs) {
      group.push(files[i])
    } else break
  }

  return group.map(f => f.path)
}


// src/utils/collectFiles.ts
import { readdir, stat } from 'fs/promises'
import { join } from 'path'

const SKIP = new Set([
  'node_modules',
  '.git',
  '.next',
  '.turbo',
  'dist',
  'build',
  '.cache',
  '.DS_Store',
])

type Opts = {
  include?: RegExp
  exclude?: RegExp
}

export async function collectFiles(dir: string, opts: Opts = {}): Promise<string[]> {
  const { include, exclude } = opts
  const results: string[] = []

  async function walk(current: string) {
    const entries = await readdir(current, { withFileTypes: true })
    for (const entry of entries) {
      if (SKIP.has(entry.name)) continue
      const path = join(current, entry.name)
      if (entry.isDirectory()) {
        await walk(path)
      } else if (entry.isFile()) {
        if (include && !include.test(path)) continue
        if (exclude && exclude.test(path)) continue
          if (entry.size < 5) {
            continue
          }
          console.log(entry)
        results.push(path)
      }
    }
  }

  const s = await stat(dir)
  if (s.isFile()) return [dir]
  await walk(dir)
  return results
}