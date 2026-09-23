import { existsSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { DEFAULT_EXCLUDE_DIRS, grep, type GrepMatch } from '@paladin/utils'

export const DEFAULT_PROJECTS = ['~/projects/mathpen', '~/projects/paladin']
export const DEFAULT_INCLUDE = ['*.ts', '*.tsx', '*.mts', '*.cts', '*.js', '*.jsx', '*.mjs', '*.cjs']

/* examples, demos and tests are never the source of truth */
export const FINDER_EXCLUDE_DIRS = [
  ...DEFAULT_EXCLUDE_DIRS,
  'example', 'examples', 'demo', 'demos', 'test', 'tests', '__tests__', '__mocks__', 'fixtures',
]
export const FINDER_EXCLUDE_FILES = [
  '*.test.*', '*.spec.*', '*.demo.*', '*.example.*', '*.examples.*', '*.bench.*', '*.stories.*',
]

// \b treats $ as a non-word char, so identifier boundaries are spelled out
const PRE = '(?:^|[^\\w$])'
const POST = '(?:[^\\w$]|$)'
const DECL = '(const|let|var|function\\*?|class|type|interface|enum|namespace)'
const PRIMITIVES = new Set([
  'string', 'number', 'boolean', 'bigint', 'symbol', 'any', 'unknown', 'never', 'void', 'object',
  'true', 'false', 'null', 'undefined', 'this', 'new', 'await', 'typeof', 'function', 'async',
])

export type FinderOpts = {
  /* base projects, ~ is expanded. defaults to mathpen + paladin */
  projects?: string[]
  /* file globs to search */
  include?: string[]
  /* dir names to skip, defaults to FINDER_EXCLUDE_DIRS */
  excludeDirs?: string[]
  /* file globs to skip, defaults to FINDER_EXCLUDE_FILES */
  excludeFiles?: string[]
}

export type ParsedSnippet = {
  /* every `backticked` item, minus package paths */
  names: string[]
  /* <name> from every packages/<name> reference */
  packages: string[]
}

export type FinderHit = {
  /* the backticked name from the snippet */
  name: string
  /* symbol: declared directly. field: a dict key / field pointing at a symbol. missing: not found */
  kind: 'symbol' | 'field' | 'missing'
  /* file holding the definition (for fields, the definition of the referenced symbol) */
  file?: string
  /* line of the definition */
  line?: number
  /* for fields: the symbol the field points at, ie foobar in {qw: foobar} */
  via?: string
  /* for fields: where the field itself was found */
  fieldFile?: string
}

export type FinderResult = {
  packages: string[]
  /* projects containing one of the referenced packages, searched first */
  start: string[]
  hits: FinderHit[]
}

export function parseSnippet(snippet: string): ParsedSnippet {
  const packages = uniq([...snippet.matchAll(/packages\/([\w.-]+)/g)].map(m => m[1]))
  const names = uniq(
    [...snippet.matchAll(/`([^`\n]+)`/g)]
      .map(m => m[1].trim())
      .filter(n => n && !/(^|\/)packages\//.test(n)),
  )
  return { names, packages }
}

export function expandHome(p: string): string {
  return resolve(p.replace(/^~(?=$|\/)/, homedir()))
}

/* projects that contain packages/<name> come first, the rest are a fallback tier */
export function resolveTiers(projects: string[], packages: string[]): { start: string[], rest: string[] } {
  const start = projects.filter(p => packages.some(pkg => existsSync(join(p, 'packages', pkg))))
  const rest = projects.filter(p => !start.includes(p))
  return { start, rest }
}

export async function finder(snippet: string, opts: FinderOpts = {}): Promise<FinderResult> {
  const projects = (opts.projects ?? DEFAULT_PROJECTS).map(expandHome)
  const { names, packages } = parseSnippet(snippet)
  const { start, rest } = resolveTiers(projects, packages)
  const tiers = [start, rest].filter(t => t.length)
  const ctx = createCtx(opts)

  const hits: FinderHit[] = []
  for (const name of names) hits.push(await locate(name, tiers, ctx))
  return { packages, start, hits }
}

type Ctx = {
  search: (pattern: string, roots: string[]) => Promise<GrepMatch[]>
  mtime: (file: string) => number
}

function createCtx(opts: FinderOpts): Ctx {
  const mtimes = new Map<string, number>()
  return {
    search: (pattern, roots) => grep(pattern, {
      paths: roots,
      include: opts.include ?? DEFAULT_INCLUDE,
      excludeDirs: opts.excludeDirs ?? FINDER_EXCLUDE_DIRS,
      excludeFiles: opts.excludeFiles ?? FINDER_EXCLUDE_FILES,
    }),
    mtime: file => {
      let t = mtimes.get(file)
      if (t === undefined) {
        try { t = statSync(file).mtimeMs } catch { t = 0 }
        mtimes.set(file, t)
      }
      return t
    },
  }
}

async function locate(name: string, tiers: string[][], ctx: Ctx): Promise<FinderHit> {
  for (const roots of tiers) {
    const def = await findDefinition(name, roots, ctx)
    if (def) return { name, kind: 'symbol', file: def.file, line: def.line }
    const field = await findField(name, roots, tiers, ctx)
    if (field) return field
  }
  return { name, kind: 'missing' }
}

async function findDefinition(name: string, roots: string[], ctx: Ctx): Promise<GrepMatch | undefined> {
  const pattern = `${PRE}${DECL}\\s+${escapeRe(name)}${POST}`
  return newest(await ctx.search(pattern, roots), ctx)
}

async function findDefinitionInTiers(name: string, tiers: string[][], ctx: Ctx) {
  for (const roots of tiers) {
    const def = await findDefinition(name, roots, ctx)
    if (def) return def
  }
}

/*
 * {qw: foobar} / {'qw': foobar} / obj = {qw: () => ...}
 * resolves the value symbol to its definition, falls back to the field's own file for inline values
 */
async function findField(name: string, roots: string[], tiers: string[][], ctx: Ctx): Promise<FinderHit | undefined> {
  const key = `['"]?${escapeRe(name)}['"]?\\s*:`
  const matches = await ctx.search(`${PRE}${key}`, roots)
  if (!matches.length) return

  // same pattern in js, plus a capture for the value symbol
  const valueRe = new RegExp(`${PRE}${key}\\s*([A-Za-z_$][\\w$]*)?`)
  const sorted = [...matches].sort((a, b) => ctx.mtime(b.file) - ctx.mtime(a.file))
  const tried = new Set<string>()
  let inline: GrepMatch | undefined

  for (const m of sorted) {
    const value = m.text.match(valueRe)?.[1]
    if (!value) {
      inline ??= m
      continue
    }
    if (PRIMITIVES.has(value) || tried.has(value)) continue
    tried.add(value)
    const def = await findDefinitionInTiers(value, tiers, ctx)
    if (def) return { name, kind: 'field', file: def.file, line: def.line, via: value, fieldFile: m.file }
  }

  if (inline) return { name, kind: 'field', file: inline.file, line: inline.line, fieldFile: inline.file }
}

/* duplicates: the file with the most recent mtime wins */
function newest(matches: GrepMatch[], ctx: Ctx): GrepMatch | undefined {
  let best: GrepMatch | undefined
  for (const m of matches) {
    if (!best || ctx.mtime(m.file) > ctx.mtime(best.file)) best = m
  }
  return best
}

/* valid in both rust regex and js RegExp */
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function uniq<T>(xs: T[]): T[] {
  return [...new Set(xs)]
}
