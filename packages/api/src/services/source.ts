// src/services/source.ts

import { getDb } from '../db'
import * as git from './git'
import * as fs from './fs'
import { basename } from 'path'
import type { FileSource, Filegroup, FilegroupRow } from '../types'

const SOURCE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.rs', '.go', '.java', '.kt', '.swift',
  '.c', '.cpp', '.h', '.hpp',
  '.css', '.scss', '.less',
  '.html', '.vue', '.svelte',
  '.sql', '.sh', '.bash', '.zsh',
  '.lua', '.rb', '.php',
  '.md', '.mdx',
])

const IGNORED_FILES = new Set([
  'package.json', 'package-lock.json', 'tsconfig.json',
  'tsconfig.build.json', 'tsconfig.node.json',
  '.eslintrc', '.eslintrc.js', '.eslintrc.json', '.eslintrc.cjs',
  '.prettierrc', '.prettierrc.js', '.prettierrc.json',
  'jest.config.ts', 'jest.config.js', 'vitest.config.ts',
  'vite.config.ts', 'vite.config.js',
  'rollup.config.js', 'webpack.config.js',
  '.gitignore', '.npmrc', '.nvmrc', '.env', '.env.local',
  'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb',
  'Makefile', 'Dockerfile', 'docker-compose.yml',
  'LICENSE', 'CHANGELOG.md',
])

function filterSourceFiles(files: string[]): string[] {
  return files.filter((f) => {
    const name = basename(f)
    if (IGNORED_FILES.has(name)) return false
    const ext = name.slice(name.lastIndexOf('.'))
    return SOURCE_EXTENSIONS.has(ext)
  })
}

function db() {
  return getDb()
}

// --- filegroups ---

export function createFilegroup(name: string, paths: string[]): Filegroup {
  db().prepare(`
    INSERT INTO filegroups (name, paths) VALUES ($name, $paths)
  `).run({ $name: name, $paths: JSON.stringify(paths) })

  return { name, paths, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
}

export function updateFilegroup(name: string, paths: string[]): Filegroup | null {
  const row = getFilegroupRow(name)
  if (!row) return null

  db().prepare(`
    UPDATE filegroups SET paths = $paths, updated_at = datetime('now') WHERE name = $name
  `).run({ $name: name, $paths: JSON.stringify(paths) })

  return getFilegroup(name)
}

export function deleteFilegroup(name: string): boolean {
  const row = getFilegroupRow(name)
  if (!row) return false
  db().prepare('DELETE FROM filegroups WHERE name = $name').run({ $name: name })
  return true
}

export function getFilegroup(name: string): Filegroup | null {
  const row = getFilegroupRow(name)
  if (!row) return null
  return {
    name: row.name,
    paths: JSON.parse(row.paths),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function listFilegroups(): Omit<Filegroup, 'paths'>[] {
  const rows = db().prepare('SELECT name, created_at, updated_at FROM filegroups ORDER BY updated_at DESC').all() as FilegroupRow[]
  return rows.map((r) => ({
    name: r.name,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }))
}

export function getFilegroupFiles(name: string): string[] | null {
  const row = getFilegroupRow(name)
  if (!row) return null
  return JSON.parse(row.paths)
}

function getFilegroupRow(name: string): FilegroupRow | null {
  return db().prepare('SELECT * FROM filegroups WHERE name = $name').get({ $name: name }) as FilegroupRow | null
}

// --- unified source listing ---

export async function listSources(): Promise<FileSource[]> {
  const sources: FileSource[] = []

  // git: modified & new
  try {
    const data = await git.getData()
    if (data.files.length > 0) {
      sources.push({
        name: 'modified & new',
        type: 'git',
        files: data.files.map((f) => f.path),
      })
    }
  } catch {
    // git not initialized or no repo set
  }

  // filegroups (names only for fzf)
  const groups = listFilegroups()
  for (const g of groups) {
    sources.push({
      name: g.name,
      type: 'filegroup',
      files: [],
    })
  }

  return sources
}

// --- resolve a specific source ---

export async function getSourceFiles(type: string, name: string, opts?: { sourceOnly?: boolean }): Promise<string[]> {
  if (type === 'git') {
    if (name === 'modified & new') {
      const data = await git.getData()
      return data.files.map((f) => f.path)
    }
    // name is a commit hash
    return git.getFilesForCommit(name)
  }

  if (type === 'filegroup') {
    return source.getFilegroupFiles(name) ?? []
  }

  if (type === 'directory') {
    // name is the directory path
    const files = await fs.list(name, { recursive: true })
    if (opts?.sourceOnly) return filterSourceFiles(files)
    return files
  }

  return []
}
