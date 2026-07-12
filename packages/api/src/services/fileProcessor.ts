import { existsSync, mkdirSync } from 'fs'
import { join, dirname, basename } from 'path'
import { expandHome } from '../utils/path'
import { prepareTypescript, prepareTypst } from './scaffold'
import { extractHeader } from './scaffold/prepare'
import { codeRunner } from './codeRunner'
import { handleGit, logProject } from './scaffold/shared'
import type { ScaffoldOptions, ScaffoldConfig } from './scaffold/types'
import type { GitData } from './git'
import type { BashResult } from '../utils/bash'
// import {openInBrowser} from "@paladin/utils/openInBrowser"

const openInBrowser = (x) => console.log(x)

export interface ScaffoldResult {
  gitData: GitData | null
  codeExecutionResults: BashResult[]
}

export interface ProcessFileResult {
  event: 'fileProcessor:scaffold'
  data: ScaffoldResult
}

const ACTIVE_DIR_FILE = expandHome('~/activeDir.txt')
const SUBLIME_DIR = expandHome('~/.config/sublime-text/Packages/User')
const SUBLIME_KEYMAP_FILE = join(SUBLIME_DIR, 'Default.sublime-keymap')

// matches a header like '# @sublime/paladin_file_browser.py' or '// @sublime/Default.sublime-keymap'
const SUBLIME_HEADER_RE = /^\s*(?:#|\/\/)\s*@sublime\/(.+?)\s*$/
// matches a keys line like '# keys: ctrl+k'
const SUBLIME_KEYS_RE = /^\s*#\s*keys:\s*(.+?)\s*$/

interface KeymapBinding {
  keys: string[]
  command: string
  args?: unknown
}

// strips the header (and optional keys) line(s) off content so it can be
// written or parsed as plain data
function stripHeader(lines: string[], count: number): string {
  return lines.slice(count).join('\n').replace(/^\n+/, '')
}

// merges keybinding entries into a keymap file, replacing any existing
// binding for the same command
async function mergeKeymap(dest: string, entries: KeymapBinding[]): Promise<void> {
  const raw = existsSync(dest) ? await Bun.file(dest).text() : '[]'
  const bindings: KeymapBinding[] = JSON.parse(raw || '[]')

  for (const entry of entries) {
    const idx = bindings.findIndex((b) => b.command === entry.command)
    if (idx === -1) bindings.push(entry)
    else bindings[idx] = entry
  }

  mkdirSync(dirname(dest), { recursive: true })
  await Bun.write(dest, JSON.stringify(bindings, null, 4) + '\n')
}

// shallow-merges settings into a .sublime-settings file
async function mergeSettings(dest: string, settings: Record<string, unknown>): Promise<void> {
  const raw = existsSync(dest) ? await Bun.file(dest).text() : '{}'
  const existing: Record<string, unknown> = JSON.parse(raw || '{}')
  const merged = { ...existing, ...settings }

  mkdirSync(dirname(dest), { recursive: true })
  await Bun.write(dest, JSON.stringify(merged, null, 4) + '\n')
}

/**
 * Handles files whose header points at '@sublime/...'. Behavior depends on
 * the target filename:
 *  - '.sublime-keymap' files: parsed as a JSON array of keybindings and
 *    merged into that keymap file.
 *  - '.sublime-settings' files (e.g. 'Side Bar.sublime-settings'): parsed as
 *    a JSON object and shallow-merged into that settings file.
 *  - anything else (e.g. a '.py' plugin): written as-is to the sublime User
 *    packages dir, and if a 'keys:' line follows the header, that binding
 *    (command = the filename without extension) is merged into the default
 *    keymap.
 */
async function handleSublime(contents: string[]): Promise<boolean> {
  let handled = false

  for (const content of contents) {
    const lines = content.split('\n')
    const headerMatch = lines[0]?.match(SUBLIME_HEADER_RE)
    if (!headerMatch) continue

    const filename = headerMatch[1]
    const dest = join(SUBLIME_DIR, filename)

    if (filename.includes('.sublime-')) {
      const entries: KeymapBinding[] = JSON.parse(stripHeader(lines, 1) || '[]')
      await mergeKeymap(dest, entries)
      continue
    }

    const body = stripHeader(lines, 1)
    mkdirSync(dirname(dest), { recursive: true })
    await Bun.write(dest, body)
    console.log(`[handleSublime] wrote ${dest}`)
  }
}

let config: ScaffoldOptions = {
  baseProjectDir: '~/projects',
  activeDir: null,
  git: { initLocalRepo: true, initRemoteRepository: true },
}

export function setOptions(opts: ScaffoldConfig): void {
  config = {
    ...config,
    ...opts,
    git: { ...config.git, ...opts.git },
  }
}

export function getOptions(): ScaffoldOptions {
  return config
}

function expandActiveDir(raw: string, base: string): string {
  if (raw.startsWith('@')) {
    const segs = raw.slice(1).split('/')
    const scope = segs[0]
    const name = segs.slice(1).join('/')
    return join(expandHome(base), scope, 'packages', name)
  }
  return expandHome(raw)
}

async function resolveOptions(): Promise<ScaffoldOptions> {
  if (config.activeDir !== null) {
    return { ...config, activeDir: expandActiveDir(config.activeDir, config.baseProjectDir) }
  }
  if (existsSync(ACTIVE_DIR_FILE)) {
    const raw = (await Bun.file(ACTIVE_DIR_FILE).text()).trim()
    if (raw) {
      return { ...config, activeDir: expandActiveDir(raw, config.baseProjectDir) }
    }
  }
  return config
}

export async function readInputs(file: string): Promise<string[]> {
  const expanded = expandHome(file)
  if (expanded.endsWith('.zip')) {
    const { unzipSync, strFromU8 } = await import('fflate')
    const buf = new Uint8Array(await Bun.file(expanded).arrayBuffer())
    const entries = unzipSync(buf)
    return Object.values(entries).map((u8) => strFromU8(u8))
  }
  return [await Bun.file(expanded).text()]
}

export function detectLanguage(contents: string[]): 'typescript' | 'typst' {
  for (const content of contents) {
    const header = extractHeader(content)
    if (header) return header.rawPath.endsWith('.typ') ? 'typst' : 'typescript'
  }
  return 'typescript'
}

export async function processFile(file: string): Promise<ProcessFileResult | null> {

  openInBrowser(file)
  const base = file.split('/').pop() ?? ''
  if (base.startsWith('conversation') && base.endsWith('.json')) {
    const { processFile: processConversationFile } = await import('./old/index')
    return processConversationFile(file)
  }

  const contents = await readInputs(file)

  if (contents.some((content) => content.includes('@sublime'))) {
    await handleSublime(contents)
    return null
  }

  const opts = await resolveOptions()
  const lang = detectLanguage(contents)

  const prepared = lang === 'typst'
    ? await prepareTypst(contents, opts)
    : await prepareTypescript(contents, opts)

  if (!prepared) return null

  if (prepared.isNew) await logProject(prepared.name, lang)

  const [codeExecutionResults, gitData] = await Promise.all([
    codeRunner(prepared.files),
    handleGit(prepared.dir, prepared.name, prepared.isNew, {
      initLocal: opts.git?.initLocalRepo ?? true,
      initRemote: opts.git?.initRemoteRepository ?? true,
    }),
  ])

  return { event: 'fileProcessor:scaffold', data: { gitData, codeExecutionResults } }
}
