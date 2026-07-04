import { readdir } from 'fs/promises'
import { join, relative } from 'path'

const DEFAULT_IGNORED_DIRS = ['node_modules', 'dist']
const DEFAULT_IGNORED_FILES = ['index.css', 'main.tsx', 'happydom.ts', 'index.html', 'package.json', 'tsconfig.json', 'vite.config.ts']

export interface CollectFilesOptions {
  ignoredDirs?: string[]
  ignoredFiles?: string[]
  includedDirs?: string[] | null
  includedFiles?: string[] | null
}

/** Recursively lists file paths under `dir` (relative to `dir`). Skips dot-entries plus anything in `ignoredDirs` / `ignoredFiles`. */
export async function collectFiles(
  dir: string,
  options: CollectFilesOptions = {},
  base = dir,
): Promise<string[]> {
  const {
    ignoredDirs = DEFAULT_IGNORED_DIRS,
    ignoredFiles = DEFAULT_IGNORED_FILES,
    includedDirs = null,
    includedFiles = null,
  } = options
  const entries = await readdir(dir, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (includedDirs ? !includedDirs.includes(entry.name) : ignoredDirs.includes(entry.name)) continue
      files.push(...(await collectFiles(full, options, base)))
    } else {
      if (includedFiles ? !includedFiles.includes(entry.name) : ignoredFiles.includes(entry.name)) continue
      files.push(relative(base, full))
    }
  }
  return files
}
