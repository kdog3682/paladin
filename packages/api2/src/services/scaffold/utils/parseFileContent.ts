import { existsSync, readFileSync } from 'fs'
import { resolveScopedPath } from '@paladin/utils'
import type { File, FileAction, FileStatus, ScaffoldOptions } from '../types'

// matches a leading '// path', '# path', or '/* path */' comment line
const COMMENT_RE = /^\s*(?:\/\/|#|\/\*+)\s*(.+?)\s*(?:\*+\/\s*)?$/
// requires the path to end in a file extension, e.g. '.ts'
const EXT_RE = /\.[a-z0-9]+$/i
// trailing directive on the header, e.g. '// foo.ts (append)'
const MARKER_RE = /\(\s*(append|delete|deprecated?)\s*\)\s*$/i

type Marker = 'append' | 'delete' | 'deprecate' | null

function readMarker(header: string, lines: string[]): Marker {
  const match = header.match(MARKER_RE)
  if (match) {
    const raw = match[1].toLowerCase()
    if (raw === 'append') return 'append'
    if (raw === 'delete') return 'delete'
    return 'deprecate'
  }
  if (lines.slice(0, 3).join('\n').toLowerCase().includes('deprecated')) return 'deprecate'
  return null
}

function fileMeta(
  marker: Marker,
  current: string | null,
  body: string,
): { status: FileStatus; action: FileAction } {
  const exists = current !== null
  if (marker === 'deprecate') return { status: 'deprecated', action: 'skip' }
  if (marker === 'delete') return { status: 'deprecated', action: exists ? 'delete' : 'skip' }
  if (marker === 'append') {
    return exists ? { status: 'modified', action: 'append' } : { status: 'created', action: 'write' }
  }
  if (current === null) return { status: 'created', action: 'write' }
  if (current.trimEnd() === body.trimEnd()) return { status: 'unchanged', action: 'skip' }
  return { status: 'modified', action: 'write' }
}

/**
 * Reads the path header off the first line of a file's content (after an optional
 * shebang), resolves it against opts, and checks the disk to decide what should
 * happen to it. Returns null when there's no usable header.
 */
export function parseFileContent(content: string, opts: ScaffoldOptions): File | null {
  if (content.trim() === '') return null

  const lines = content.split('\n')

  // skip a shebang line if present, so the header comment is checked next
  const idx = lines[0]?.startsWith('#!') ? 1 : 0
  const line = lines[idx]
  if (line === undefined) return null

  const match = line.match(COMMENT_RE)
  if (!match) return null

  const header = match[1].trim()
  const rawPath = header.replace(MARKER_RE, '').trim()
  if (!rawPath || !EXT_RE.test(rawPath)) return null

  // body is everything except the header/shebang line, with leading blank lines trimmed
  const body = lines
    .filter((_, i) => i !== idx)
    .join('\n')
    .replace(/^\n+/, '')

  const path = resolveScopedPath(rawPath, opts)
  const current = existsSync(path) ? readFileSync(path, 'utf8') : null

  return { path, content: body, ...fileMeta(readMarker(header, lines), current, body) }
}
