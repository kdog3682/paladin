// @paladin/api/scripts/bootstrap-paladin-api.ts
//
// watches ~/scratch; when a .zip lands, extracts it, reads each file's path
// comment, resolves it (active dir provided), and writes the body into place.
// the simple case only: no boilerplate, no manifest, no git. self-contained.

import {
  watch, existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, statSync, rmSync,
} from 'fs'
import { join, dirname } from 'path'
import { homedir, tmpdir } from 'os'

function expandHome(p: string): string {
  return p.startsWith('~') ? join(homedir(), p.slice(1)) : p
}

const SCRATCH = expandHome('~/scratch')
const ACTIVE_DIR = expandHome('~/projects/paladin/packages/api')
const BASE = expandHome('~/projects')
const SRC_DIRS = ['src', 'docs', 'scripts']

const COMMENT_RE = /^\s*(?:\/\/|#)\s*(.+?)\s*$/
const EXT_RE = /\.[a-z0-9]+$/i

function firstSeg(p: string): string {
  return p.split('/')[0]
}

function extractHeader(content: string): { rawPath: string; body: string } | null {
  if (content.trim() === '') return null

  const lines = content.split('\n')
  if (lines.slice(0, 3).join('\n').toLowerCase().includes('deprecated')) return null

  let idx = 0
  if (lines[0]?.startsWith('#!')) idx = 1

  const line = lines[idx]
  if (line === undefined) return null

  const m = line.match(COMMENT_RE)
  if (!m) return null

  const rawPath = m[1].trim()
  if (!rawPath || !EXT_RE.test(rawPath)) return null

  const body = lines.filter((_, i) => i !== idx).join('\n').replace(/^\n+/, '')
  return { rawPath, body }
}

// same resolution rules as the scaffold service, with a fixed active dir.
function resolvePath(rawPath: string): string {
  if (rawPath.startsWith('/') || rawPath.startsWith('~')) return expandHome(rawPath)

  if (rawPath.startsWith('@')) {
    const segs = rawPath.slice(1).split('/')
    const scope = segs[0]
    const rest = segs.slice(1)
    if (rest[0] === 'packages') {
      const pkg = rest[1]
      const tail = rest.slice(2).join('/')
      const withSrc = SRC_DIRS.includes(firstSeg(tail)) ? tail : join('src', tail)
      return join(BASE, scope, 'packages', pkg, withSrc)
    }
    return join(BASE, scope, 'packages', rest.join('/'))
  }

  const isBasename = !rawPath.includes('/')
  const isDotRel = rawPath.startsWith('./') || rawPath.startsWith('../')
  if (isBasename || isDotRel || SRC_DIRS.includes(firstSeg(rawPath))) {
    return join(ACTIVE_DIR, rawPath)
  }

  const segs = rawPath.split('/')
  const project = segs[0]
  const rest = segs.slice(1).join('/')
  const withSrc = SRC_DIRS.includes(firstSeg(rest)) ? rest : join('src', rest)
  return join(BASE, project, withSrc)
}

function walk(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else out.push(full)
  }
  return out
}

function handleZip(zipPath: string): void {
  const dest = join(tmpdir(), `paladin-${Date.now()}`)
  mkdirSync(dest, { recursive: true })

  const proc = Bun.spawnSync(['unzip', '-o', zipPath, '-d', dest])
  if (proc.exitCode !== 0) {
    console.error(`unzip failed: ${zipPath}`)
    rmSync(dest, { recursive: true, force: true })
    return
  }

  for (const file of walk(dest)) {
    const header = extractHeader(readFileSync(file, 'utf8'))
    if (!header) continue
    const target = resolvePath(header.rawPath)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, header.body)
    console.log(`wrote ${target}`)
  }

  rmSync(dest, { recursive: true, force: true })
}

mkdirSync(SCRATCH, { recursive: true })
console.log(`watching ${SCRATCH} for .zip files...`)

watch(SCRATCH, (_event, filename) => {
  if (!filename || !filename.endsWith('.zip')) return
  const zipPath = join(SCRATCH, filename)
  if (!existsSync(zipPath)) return
  handleZip(zipPath)
})