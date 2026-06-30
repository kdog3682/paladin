// Handles conversation*.json files (Claude chat exports)

import path from 'node:path'
import os from 'node:os'
import { mkdir } from 'node:fs/promises'
import * as git from '../git'
import { codeRunner } from '../codeRunner'
import type { ProcessFileResult } from '../fileProcessor'

// ── types ────────────────────────────────────────────────────────────────────

interface Conversation {
  id: string
  url: string
  title: string
  createdAt: string
  updatedAt: string
  artifacts: ArtifactEntry[]
}

interface ArtifactEntry {
  id: string
  content: string
  updatedAt: string | null
}

interface FileEntry {
  path: string
  content: string
}

// ── extract-header ────────────────────────────────────────────────────────────

const COMMENT_PATTERNS = [
  /^\/\/\s*(.+)/,
  /^#(?!!)(?:#*)\s+(.+)/,
  /^<!--\s*(.+?)\s*-->/,
]

const SKIP_ACTIONS = new Set(['delete', 'deleted', 'deprecate', 'deprecated'])

function extractHeader(content: string): string | null {
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#!')) continue

    for (const pattern of COMMENT_PATTERNS) {
      const m = trimmed.match(pattern)
      if (!m) continue
      return parseHeaderComment(m[1])
    }

    return null
  }
  return null
}

function parseHeaderComment(raw: string): string | null {
  const match = raw.trim().match(/^(\S+)/)
  if (!match) return null
  const token = match[1]
  if (!token.includes('/') && !token.includes('.')) return null
  const rest = raw.trim().slice(token.length).trim()
  if (rest && SKIP_ACTIONS.has(rest.toLowerCase())) return null
  return token
}

// ── extract-base-dir ──────────────────────────────────────────────────────────

const SCOPED_PKG_RE = /@([\w-]+)\/([\w-]+)/

function extractScopeFromTitle(title: string): string | null {
  const m = title.match(SCOPED_PKG_RE)
  if (!m) return null
  return `@${m[1]}/${m[2]}`.toLowerCase()
}

// ── resolve-path ──────────────────────────────────────────────────────────────

const SCOPED_ALIASES: Record<string, string> = {
  web: 'paladin/web',
  api: 'paladin/api',
}

const WORKSPACE_FOLDERS = ['packages', 'apps']
const DEFAULT_WORKSPACE = 'packages'
const DEFAULT_PKG = 'api'

const SKIP_SRC_DIRS = ['src', 'docs', 'scripts', 'python', 'typst']
const CONFIG_PREFIXES = ['tsconfig', 'package.json']

const WEB_REFS = new Set([
  'components', 'stores', 'pages', 'views', 'layouts', 'hooks',
  'context', 'providers', 'ui', 'assets', 'styles', 'icons', 'theme',
])

function expandDir(dir: string): string {
  return dir.startsWith('~/') ? path.join(os.homedir(), dir.slice(2)) : dir
}

function inferPkg(segments: string[]): 'web' | 'api' | null {
  for (const s of segments) {
    if (WEB_REFS.has(s)) return 'web'
  }
  return null
}

function shouldSkipSrc(firstSeg: string | undefined): boolean {
  if (!firstSeg) return true
  return (
    SKIP_SRC_DIRS.includes(firstSeg) ||
    CONFIG_PREFIXES.some((c) => firstSeg.startsWith(c)) ||
    firstSeg.includes('.config.')
  )
}

function joinWithSrc(filePath: string, segments: string[]): string {
  if (!filePath) return ''
  return shouldSkipSrc(segments[0]) ? filePath : `src/${filePath}`
}

function parseScoped(rawPath: string) {
  let withoutAt = rawPath.slice(1)
  const firstSeg = withoutAt.split('/')[0]
  if (SCOPED_ALIASES[firstSeg]) {
    withoutAt = SCOPED_ALIASES[firstSeg] + withoutAt.slice(firstSeg.length)
  }

  const parts = withoutAt.split('/')
  const org = parts[0].toLowerCase()
  const isExplicitWs = WORKSPACE_FOLDERS.includes(parts[1])
  const wsFolder = isExplicitWs ? parts[1] : DEFAULT_WORKSPACE
  const pkg = (isExplicitWs ? parts[2] : parts[1])?.toLowerCase()
  const rest = isExplicitWs ? parts.slice(3) : parts.slice(2)

  return { org, wsFolder, pkg, rest, filePath: rest.join('/') }
}

function resolveScoped(rawPath: string, baseProjectsDir: string): string {
  const base = expandDir(baseProjectsDir)
  const { org, wsFolder, pkg, rest, filePath } = parseScoped(rawPath)
  const isExplicitScope = pkg === 'web' || pkg === 'api'

  if (!isExplicitScope && filePath) {
    const targetPkg = inferPkg(rest) ?? DEFAULT_PKG
    return path.join(base, org, wsFolder, targetPkg, joinWithSrc(filePath, rest))
  }

  if (!filePath) return path.join(base, org, wsFolder, pkg)
  return path.join(base, org, wsFolder, pkg, joinWithSrc(filePath, rest))
}

function resolveRelative(relativePath: string, baseDir: string): string {
  const parts = relativePath.split('/')
  if (parts[0] === 'src') return path.join(baseDir, relativePath)
  return path.join(baseDir, 'src', relativePath)
}

function resolveWithoutScope(rawPath: string, baseProjectsDir: string): string {
  const segments = rawPath.replace(/^src\//, '').split('/')
  const targetPkg = inferPkg(segments) ?? DEFAULT_PKG
  return resolveScoped(`@paladin/${targetPkg}/${rawPath}`, baseProjectsDir)
}

function resolvePath(
  rawPath: string,
  scope?: string | null,
  baseProjectsDirectory?: string | null,
): string {
  const projectsDir = baseProjectsDirectory ?? '~/projects'

  if (rawPath.startsWith('~/')) return path.join(os.homedir(), rawPath.slice(2))
  if (path.isAbsolute(rawPath)) return rawPath
  if (rawPath.startsWith('@')) return resolveScoped(rawPath, projectsDir)

  if (!scope) return resolveWithoutScope(rawPath, projectsDir)

  const resolvedBase = scope.startsWith('@')
    ? resolveScoped(scope, projectsDir)
    : expandDir(scope)

  return resolveRelative(rawPath, resolvedBase)
}

// ── find-root ─────────────────────────────────────────────────────────────────

function findProjectRoot(
  filePath: string,
  baseProjectsDir: string,
): { dir: string; name: string } | null {
  const base = expandDir(baseProjectsDir).replace(/\/$/, '')
  if (!filePath.startsWith(base)) return null

  const rel = filePath.slice(base.length + 1)
  const parts = rel.split(path.sep)
  const org = parts[0]
  if (!org) return null

  return { dir: path.join(base, org), name: org }
}

// ── process-conversation ──────────────────────────────────────────────────────

function extractArtifacts(conversation: Conversation): Map<string, { content: string; updatedAt: string | null }> {
  const artifacts = new Map<string, { content: string; updatedAt: string | null }>()
  for (const a of conversation.artifacts) {
    if (a.id && a.content != null) {
      artifacts.set(a.id, { content: a.content, updatedAt: a.updatedAt ?? null })
    }
  }
  return artifacts
}

function processConversation(
  conversation: Conversation,
  baseProjectsDirectory: string,
): { files: FileEntry[] } | null {
  const artifacts = extractArtifacts(conversation)

  const baseDir = extractScopeFromTitle(conversation.title)

  const byPath = new Map<string, { content: string; updatedAt: string | null }>()

  for (const artifact of artifacts.values()) {
    const rawPath = extractHeader(artifact.content)
    if (!rawPath) continue

    const resolved = resolvePath(rawPath, baseDir, baseProjectsDirectory)

    const existing = byPath.get(resolved)
    if (existing && existing.updatedAt && artifact.updatedAt) {
      if (artifact.updatedAt <= existing.updatedAt) continue
    }

    byPath.set(resolved, { content: artifact.content, updatedAt: artifact.updatedAt })
  }

  const files: FileEntry[] = Array.from(byPath, ([p, entry]) => ({ path: p, content: entry.content }))
  if (!files.length) return null

  return { files }
}

// ── main export ───────────────────────────────────────────────────────────────

const BASE_PROJECTS_DIR = path.join(os.homedir(), 'projects')

export async function processFile(file: string): Promise<ProcessFileResult | null> {
  const conversation: Conversation = JSON.parse(await Bun.file(file).text())

  const result = processConversation(conversation, BASE_PROJECTS_DIR)
  if (!result) {
    console.log('no result from processConversation: no files extracted')
    return null
  }

  const { files } = result

  const project = findProjectRoot(files[0].path, BASE_PROJECTS_DIR)
  if (!project) {
    console.log('unable to find a project root for', files[0].path)
    return null
  }

  for (const f of files) {
    await mkdir(path.dirname(f.path), { recursive: true })
    await Bun.write(f.path, f.content)
  }

  await git.setRepo(project.dir)
  await git.init()

  const codeExecutionResults = await codeRunner(files)

  await git.add('.')
  const gitData = await git.getData()

  return { event: 'fileProcessor:scaffold', data: { gitData, codeExecutionResults } }
}
