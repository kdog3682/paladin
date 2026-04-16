// packages/api/src/fcache.ts
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execFileSync } from 'node:child_process'
import { Biome } from '@biomejs/js-api/nodejs'

const FCACHE_DIR = path.join(os.homedir(), '.paladin', 'fcache', 'files')

// --- path helpers ---

function paths(file: string) {
  const key = path.resolve(file).replace(/\//g, '-').replace(/^-/, '')
  const base = path.join(FCACHE_DIR, key)
  const meta = path.join(base, 'meta')
  const data = path.join(base, 'data')
  return {
    base,
    meta,
    data,
    modifiedAt: path.join(meta, 'modifiedAt.txt'),
    createdAt: path.join(meta, 'createdAt.txt'),
    raw: path.join(base, 'raw.txt'),
    content: path.join(base, 'content.txt'),
  }
}

function ensureDirs(p: ReturnType<typeof paths>) {
  fs.mkdirSync(p.meta, { recursive: true })
  fs.mkdirSync(p.data, { recursive: true })
}

function readFile(f: string): string | null {
  return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null
}

function writeJson(f: string, value: any) {
  fs.mkdirSync(path.dirname(f), { recursive: true })
  fs.writeFileSync(f, JSON.stringify(value))
  return value
}

// --- formatting ---

const INDENT_WIDTH = 2
const LINE_WIDTH = 70

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
  })
  _biome = { biome, projectKey }
  return _biome
}

function formatExec(cmd: string, args: string[], input: string): string {
  try {
    return execFileSync(cmd, args, {
      input,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
    })
  } catch {
    return input
  }
}

function format(file: string, raw: string): string {
  const ext = path.extname(file).toLowerCase()

  switch (ext) {
    case '.js':
    case '.jsx':
    case '.ts':
    case '.tsx':
    case '.mjs':
    case '.cjs':
    case '.mts':
    case '.cts':
    case '.json': {
      try {
        const { biome, projectKey } = getBiome()
        return biome.formatContent(projectKey, raw, { filePath: file }).content
      } catch {
        return raw
      }
    }
    case '.py':
      return formatExec(
        'ruff',
        ['format', '--line-length', String(LINE_WIDTH), '-'],
        raw,
      )
    case '.typ':
      return formatExec(
        'typstyle',
        ['-l', String(LINE_WIDTH), '-t', String(INDENT_WIDTH)],
        raw,
      )
    default:
      return raw
  }
}

// --- public API ---

export function write(file: string, rawContent: string): void {
  const p = paths(file)
  const now = new Date().toISOString()
  const existing = readFile(p.raw)

  if (existing === null) {
    ensureDirs(p)
    fs.writeFileSync(p.createdAt, now)
  } else if (existing === rawContent) {
    return
  }

  fs.writeFileSync(p.raw, rawContent)
  fs.writeFileSync(p.content, format(file, rawContent))
  fs.writeFileSync(p.modifiedAt, now)
}

export function read(file: string): string {
  const content = readFile(paths(file).content)
  if (content === null) throw new Error(`fcache: no content for ${file}`)
  return content
}

export function isModified(file: string): boolean {
  const modifiedAt = readFile(paths(file).modifiedAt)
  if (modifiedAt === null) return true
  return fs.statSync(file).mtimeMs > new Date(modifiedAt).getTime()
}

// --- decorator ---

type AnyFn = (file: string, ...rest: any[]) => any

export function fcache<F extends AnyFn>(fn: F): F {
  const key = fn.name
  if (!key) throw new Error('fcache: function must have a name')

  return ((file: string, ...rest: any[]) => {
    const dataFile = path.join(paths(file).data, `${key}.json`)

    if (!isModified(file)) {
      return JSON.parse(fs.readFileSync(dataFile, 'utf8'))
    }

    const result = fn(file, ...rest)
    return result && typeof result.then === 'function'
      ? result.then((v: any) => writeJson(dataFile, v))
      : writeJson(dataFile, result)
  }) as F
}
