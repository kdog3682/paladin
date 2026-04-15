// src/services/fs.ts

import { join, basename, dirname } from 'path'
import { readdir, stat, mkdir, unlink, rename as fsRename } from 'node:fs/promises'
import type { DirEntry } from '../types'

export async function read(path: string): Promise<string> {
  const file = Bun.file(path)
  return file.text()
}

export async function write(path: string, content: string): Promise<void> {
  await ensureDir(dirname(path))
  await Bun.write(path, content)
}

export async function exists(path: string): Promise<boolean> {
  const file = Bun.file(path)
  return file.exists()
}

export async function remove(path: string): Promise<void> {
  await unlink(path)
}

export async function move(src: string, dest: string): Promise<void> {
  await ensureDir(dirname(dest))
  await fsRename(src, dest)
}

export async function renameFile(src: string, newName: string): Promise<void> {
  const dest = join(dirname(src), newName)
  await fsRename(src, dest)
}

export async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true })
}

export async function readDir(dir: string): Promise<DirEntry[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  return entries.map((e) => ({
    name: e.name,
    path: join(dir, e.name),
    isDirectory: e.isDirectory(),
  }))
}

export async function list(
  dir: string,
  opts: { recursive?: boolean, glob?: string } = {},
): Promise<string[]> {
  const results: string[] = []
  const entries = await readdir(dir, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (opts.recursive) {
        const nested = await list(fullPath, opts)
        results.push(...nested)
      }
    } else {
      if (opts.glob) {
        const g = new Bun.Glob(opts.glob)
        if (g.match(entry.name)) {
          results.push(fullPath)
        }
      } else {
        results.push(fullPath)
      }
    }
  }

  return results
}

export async function fileInfo(path: string) {
  const s = await stat(path)
  return {
    size: s.size,
    isDirectory: s.isDirectory(),
    isFile: s.isFile(),
    modifiedAt: s.mtime.toISOString(),
    createdAt: s.birthtime.toISOString(),
  }
}
