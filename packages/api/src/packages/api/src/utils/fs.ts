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
