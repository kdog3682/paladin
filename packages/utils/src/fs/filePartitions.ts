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
  | 'types'
  | 'docs'
  | 'style'
  | 'data'
  | 'source'

export type Group = 'runnable' | 'code' | 'assets' | 'all'

export type Preset = Kind | Group

type Rule = {
  kind: string
  desc?: string
  dirs?: string[]
  files?: string[]
  exts?: string[]
  not?: string[]
}

type Compiled = {
  kind: Kind
  pattern: RegExp
  not: RegExp[]
}

const GROUPS = {
  runnable: ['demo', 'script', 'test', 'bench'],
  code: ['source', 'types', 'story', 'demo', 'script', 'test', 'bench'],
  assets: ['style', 'data', 'docs', 'corpus'],
} as const satisfies Record<Exclude<Group, 'all'>, readonly Kind[]>

const escape = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const toFile = (file: string): string =>
  file.endsWith('*') ? `${escape(file.slice(0, -1))}[^/]*` : escape(file)

const compile = (rule: Rule): RegExp => {
  const parts: string[] = []
  if (rule.dirs?.length) parts.push(`(^|/)(${rule.dirs.map(escape).join('|')})/`)
  if (rule.files?.length) parts.push(`(^|/)(${rule.files.map(toFile).join('|')})$`)
  if (rule.exts?.length) parts.push(`\\.(${rule.exts.map(escape).join('|')})$`)
  return parts.length ? new RegExp(parts.join('|'), 'i') : /(?!)/
}

const RAW = rules.rules as Rule[]

const PATTERNS = new Map<string, RegExp>(RAW.map((rule) => [rule.kind, compile(rule)]))

const RULES: readonly Compiled[] = RAW.map((rule) => ({
  kind: rule.kind as Kind,
  pattern: PATTERNS.get(rule.kind) ?? /(?!)/,
  not: (rule.not ?? []).flatMap((kind) => {
    const pattern = PATTERNS.get(kind)
    return pattern ? [pattern] : []
  }),
}))

const KINDS = RULES.map(({ kind }) => kind)

const normalizeExt = (ext: string): string => ext.replace(/^\./, '').toLowerCase()

const IGNORED_DIRS = new Set<string>(rules.ignore.dirs)
const IGNORED_EXTS = new Set<string>(rules.ignore.exts.map(normalizeExt))
const IGNORED_FILES = new Set<string>(rules.ignore.files)

type ExpandPreset<P> = P extends 'all'
  ? Kind
  : P extends keyof typeof GROUPS
    ? (typeof GROUPS)[P][number]
    : P extends Kind
      ? P
      : never

type KindsOf<P> = P extends readonly (infer U)[] ? ExpandPreset<U> : ExpandPreset<P>

export type FilePartitions<P extends Preset | readonly Preset[] = 'all'> = Record<
  KindsOf<P>,
  string[]
>

export const classify = (file: string): [file: string, kind: Kind | null] => {
  for (const { kind, pattern, not } of RULES) {
    if (!pattern.test(file)) continue
    if (not.some((excluded) => excluded.test(file))) continue
    return [file, kind]
  }
  return [file, null]
}

const resolvePresets = (presets: Preset | readonly Preset[]): Set<Kind> => {
  const list = Array.isArray(presets) ? presets : [presets as Preset]
  const kinds = new Set<Kind>()
  for (const preset of list) {
    if (preset === 'all') {
      for (const kind of KINDS) kinds.add(kind)
      continue
    }
    const group = GROUPS[preset as Exclude<Group, 'all'>]
    if (group) for (const kind of group) kinds.add(kind)
    else kinds.add(preset as Kind)
  }
  return kinds
}

const walk = (root: string, rel: string, out: string[]): void => {
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

    out.push(path)
  }
}

export const filePartitions = <P extends Preset | readonly Preset[] = 'all'>(
  dir: string,
  presets?: P,
): FilePartitions<P> => {
  const kinds = resolvePresets(presets ?? 'all')

  const partitions = {} as Record<Kind, string[]>
  for (const kind of kinds) partitions[kind] = []

  const files: string[] = []
  walk(dir, '', files)

  for (const file of files) {
    const [, kind] = classify(file)
    if (kind !== null && kinds.has(kind)) partitions[kind].push(file)
  }

  for (const kind of kinds) partitions[kind].sort()

  return partitions as FilePartitions<P>
}
