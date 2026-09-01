import rules from '../fs/rules.json'

export type Kind =
  | 'demo'
  | 'example'
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

const NEVER = /(?!)/

function escape(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function toFile(file: string): string {
  return file.endsWith('*') ? `${escape(file.slice(0, -1))}[^/]*` : escape(file)
}

function compile(rule: Omit<Rule, 'kind'>): RegExp {
  const parts: string[] = []
  if (rule.dirs?.length) parts.push(`(^|/)(${rule.dirs.map(escape).join('|')})/`)
  if (rule.files?.length) parts.push(`(^|/)(${rule.files.map(toFile).join('|')})$`)
  if (rule.exts?.length) parts.push(`\\.(${rule.exts.map(escape).join('|')})$`)
  return parts.length ? new RegExp(parts.join('|'), 'i') : NEVER
}

const RAW = rules.rules as Rule[]
const PATTERNS = new Map<string, RegExp>(RAW.map((rule) => [rule.kind, compile(rule)]))

/**
 * A `not` entry is either the name of another kind (reuse its compiled pattern)
 * or a literal file pattern like `shared.ts`, `shared.*`, `dir/`, or `.css`.
 */
function compileNot(element: string): RegExp {
  const known = PATTERNS.get(element)
  if (known) return known
  if (element.endsWith('/')) return compile({ dirs: [element.slice(0, -1)] })
  if (element.startsWith('.')) return compile({ exts: [element.slice(1)] })
  return compile({ files: [element] })
}

const RULES: readonly CompiledRule[] = RAW.map((rule) => ({
  kind: rule.kind as Kind,
  pattern: PATTERNS.get(rule.kind) ?? NEVER,
  not: (rule.not ?? []).map(compileNot),
}))

/** Classifies a file path into a Kind based on rules.json, or null if none match. */
export function classify(file: string): Kind | null {
  for (const { kind, pattern, not } of RULES) {
    if (!pattern.test(file)) continue
    if (not.some((excluded) => excluded.test(file))) continue
    return kind
  }
  return null
}
