import { readdirSync } from 'node:fs'
import { extname, join } from 'node:path'
import rules from './rules.json'

export type Kind =
  | 'demo'
  | 'story'
  | 'test'
  | 'bench'
  | 'fixture'
  | 'corpus'
  | 'script'
  | 'manifest'
  | 'boilerplate'
  | 'types'
  | 'docs'
  | 'style'
  | 'data'
  | 'source'

export type Group = 'runnable' | 'code' | 'assets'

export type Preset = Kind | Group

type Rule = {
  kind: string
  desc?: string
  dirs?: string[]
  files?: string[]
  exts?: string[]
  not?: string[]
}

type CompiledRule = {
  kind: Kind
  pattern: RegExp
  not: RegExp[]
}

const GROUPS: Record<Group, readonly Kind[]> = {
  runnable: ['demo', 'script', 'test', 'bench'],
  code: ['source', 'types', 'story', 'demo', 'script', 'test', 'bench'],
  assets: ['style', 'data', 'docs', 'corpus'],
}

function escape(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function toFile(file: string): string {
  return file.endsWith('*') ? `${escape(file.slice(0, -1))}[^/]*` : escape(file)
}

function compile(rule: Rule): RegExp {
  const parts: string[] = []
  if (rule.dirs?.length) parts.push(`(^|/)(${rule.dirs.map(escape).join('|')})/`)
  if (rule.files?.length) parts.push(`(^|/)(${rule.files.map(toFile).join('|')})$`)
  if (rule.exts?.length) parts.push(`\\.(${rule.exts.map(escape).join('|')})$`)
  return parts.length ? new RegExp(parts.join('|'), 'i') : /(?!)/
}

const RAW = rules.rules as Rule[]

const PATTERNS = new Map<string, RegExp>(RAW.map((rule) => [rule.kind, compile(rule)]))

const RULES: readonly CompiledRule[] = RAW.map((rule) => ({
  kind: rule.kind as Kind,
  pattern: PATTERNS.get(rule.kind) ?? /(?!)/,
  not: (rule.not ?? []).flatMap((kind) => {
    const pattern = PATTERNS.get(kind)
    return pattern ? [pattern] : []
  }),
}))

function normalizeExt(ext: string): string {
  return ext.replace(/^\./, '').toLowerCase()
}

const IGNORED_DIRS = new Set<string>(rules.ignore.dirs)
const IGNORED_EXTS = new Set<string>(rules.ignore.exts.map(normalizeExt))
const IGNORED_FILES = new Set<string>(rules.ignore.files)

/** Classifies a file path into a Kind based on rules.json, or null if none match. */
export function classify(file: string): Kind | null {
  for (const { kind, pattern, not } of RULES) {
    if (!pattern.test(file)) continue
    if (not.some((excluded) => excluded.test(file))) continue
    return kind
  }
  return null
}

function expand(preset: Preset): readonly Kind[] {
  return GROUPS[preset as Group] ?? [preset as Kind]
}

function walk(root: string, rel: string, out: string[]): void {
  let entries
  try {
    entries = readdirSync(rel ? join(root, rel) : root, { withFileTypes: true })
  } catch {
    return
  }

  for (const entry of entries) {
    const name = entry.name
    if (name.startsWith('.')) continue
    const path = rel ? `${rel}/${name}` : name

    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(name)) continue
      walk(root, path, out)
      continue
    }

    if (!entry.isFile()) continue
    if (IGNORED_FILES.has(name)) continue
    if (IGNORED_EXTS.has(normalizeExt(extname(name)))) continue

    out.push(join(root, path))
  }
}

/** Walks `dir` and buckets files by `presets`, returning one sorted array per preset in order. */
export function filePartitions(dir: string, presets: readonly Preset[]): string[][] {
  const files: string[] = []
  walk(dir, '', files)

  const byKind = new Map<Kind, string[]>()
  for (const file of files) {
    const kind = classify(file)
    if (kind === null) continue
    const list = byKind.get(kind)
    if (list) list.push(file)
    else byKind.set(kind, [file])
  }

  return presets.map((preset) => {
    const out: string[] = []
    for (const kind of expand(preset)) {
      const list = byKind.get(kind)
      if (list) out.push(...list)
    }
    return out.sort()
  })
}
