// packages/api/src/fcache/index.ts
import path from 'node:path'
import os from 'node:os'
import { stat } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { Biome } from '@biomejs/js-api/nodejs'
import { readFileSafe, writeFileSafe } from '../utils/fs'
import { stripHeader, stripJsonComments } from './utils/strip'

const execFileAsync = promisify(execFile)

const FCACHE_DIR = path.join(os.homedir(), '.paladin', 'fcache', 'files')
const INDENT_WIDTH = 2
const LINE_WIDTH = 70

// --- path helpers ---

function paths(file: string) {
  const key = path.resolve(file).replace(/\//g, '-').replace(/^-/, '')
  const base = path.join(FCACHE_DIR, key)
  const meta = path.join(base, 'meta')
  return {
    base,
    data: path.join(base, 'data'),
    modifiedAt: path.join(meta, 'modifiedAt.txt'),
    createdAt: path.join(meta, 'createdAt.txt'),
    raw: path.join(base, 'raw.txt'),
  }
}

// --- preformat ---

function preformat(file: string, raw: string): string {
  const ext = path.extname(file).toLowerCase()
  if (ext === '.json') return stripJsonComments(raw)
  return stripHeader(raw)
}

// --- formatting ---

const BIOME_EXTS = new Set([
  '.js', '.jsx', '.ts', '.tsx',
  '.mjs', '.cjs', '.mts', '.cts',
  '.json',
])

let _biome: { biome: Biome, projectKey: number } | null = null

function getBiome() {
  if (_biome) return _biome
  const biome = new Biome()
  const { projectKey } = biome.openProject()
  biome.applyConfiguration(projectKey, {
    formatter: {
      enabled: true,
      indentStyle: 'space',
      indentWidth: INDENT_WIDTH,
      lineWidth: LINE_WIDTH,
    },
    javascript: {
      formatter: {
        semicolons: 'asNeeded',
      },
    },
  })
  _biome = { biome, projectKey }
  return _biome
}

async function format(file: string, raw: string): Promise<string> {
  const ext = path.extname(file).toLowerCase()

  if (BIOME_EXTS.has(ext)) {
    const { biome, projectKey } = getBiome()
    return biome.formatContent(projectKey, raw, { filePath: file }).content
  }

  switch (ext) {
    case '.py': {
      const { stdout } = await execFileAsync(
        'ruff',
        ['format', '--line-length', String(LINE_WIDTH), '-'],
        { input: raw },
      )
      return stdout
    }
    case '.typ': {
      const { stdout } = await execFileAsync(
        'typstyle',
        ['-l', String(LINE_WIDTH), '-t', String(INDENT_WIDTH)],
        { input: raw },
      )
      return stdout
    }
    default:
      return raw
  }
}

// --- public API ---

async function write(file: string, rawContent: string, opts: {force?: bool}): Promise<string | null> {
  const p = paths(file)
  const now = new Date().toISOString()

  if (opts.force) {
  await writeFileSafe(p.createdAt, now)
}
    else {
      const existing = await readFileSafe(p.raw)

  if (existing === rawContent) {
    if (opts.force) {return file}
    return null
  }
  if (existing === null) await writeFileSafe(p.createdAt, now)
   }
  const formatted = await format(file, preformat(file, rawContent))

  await writeFileSafe(p.raw, rawContent)
  await writeFileSafe(file, formatted)
  await writeFileSafe(p.modifiedAt, now)
  return file
}

async function isModified(file: string): Promise<boolean> {
  const modifiedAt = await readFileSafe(paths(file).modifiedAt)
  if (modifiedAt === null) return true
  const { mtimeMs } = await stat(file)
  return mtimeMs > new Date(modifiedAt).getTime()
}

type AnyFn = (file: string, ...rest: any[]) => Promise<any> | any

async function runWithKey<T>(
  file: string,
  key: string,
  fn: (file: string) => Promise<T> | T,
): Promise<T> {
  const dataFile = path.join(paths(file).data, `${key}.json`)

  if (!(await isModified(file))) {
    return (await readFileSafe(dataFile)) as T
  }

  const result = await fn(file)
  await writeFileSafe(dataFile, result)
  return result
}

function run<T>(
  file: string,
  fn: (file: string) => Promise<T> | T,
): Promise<T> {
  if (!fn.name) throw new Error('fcache.run: function must have a name')
  return runWithKey(file, fn.name, fn)
}

function wrap<F extends AnyFn>(fn: F): F {
  if (!fn.name) throw new Error('fcache.wrap: function must have a name')
  return ((file: string, ...rest: any[]) =>
    runWithKey(file, fn.name, (f) => fn(f, ...rest))) as F
}

export const fcache = { write, isModified, run, wrap }
