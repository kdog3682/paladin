import { isBuiltin as isNodeBuiltin } from 'node:module'
import { isPackageName } from './string/isPackageName'

const BUN_BUILTINS = new Set(['bun'])

function isRelative(spec: string): boolean {
  return spec.startsWith('.') || spec.startsWith('/')
}

function packageRoot(spec: string): string {
  const segs = spec.split('/')
  if (spec.startsWith('@')) return segs.slice(0, 2).join('/')
  return segs[0] ?? spec
}

function isBuiltin(spec: string): boolean {
  if (spec.startsWith('bun:')) return true
  const root = packageRoot(spec)
  return isNodeBuiltin(spec) || isNodeBuiltin(root) || BUN_BUILTINS.has(root)
}

/** A hard ceiling in case a file has no declaration at all. */
export const DEFAULT_MAX_LINES = 30

/**
 * The first real declaration ends the import block. `export` only counts when what
 * follows is a declaration — `export * from` and `export { x } from` are imports.
 * `type` and `interface` are deliberately absent: stopping there would cut off any
 * import written below them.
 */
const STOP_RE =
  /^[ \t]*(?:export\s+(?:default|const|let|var|async|function|class|abstract|enum|namespace)\b|(?:const|let|var|function|class|enum|namespace|declare)\b|async\s+function\b)/

/**
 * Drops comments from one line, copying string literals through untouched — the
 * quote tracking exists so that the `//` in `from "https://esm.sh/x"` isn't read as
 * a comment. `inBlockComment` carries across lines so a license header spanning ten
 * of them can't contribute a stray `import`.
 *
 * Bailing on an unterminated quote is safe: the rest of the line was string content,
 * and a specifier is never split across lines.
 */
function stripComments(line: string, state: { inBlockComment: boolean }): string {
  let out = ''
  let i = 0

  while (i < line.length) {
    if (state.inBlockComment) {
      const end = line.indexOf('*/', i)
      if (end === -1) return out
      state.inBlockComment = false
      i = end + 2
      continue
    }

    const ch = line[i]!
    const next = line[i + 1]

    if (ch === '/' && next === '/') return out

    if (ch === '/' && next === '*') {
      state.inBlockComment = true
      i += 2
      continue
    }

    if (ch === '"' || ch === "'" || ch === '`') {
      let end = -1
      for (let j = i + 1; j < line.length; j++) {
        if (line[j] === '\\') {
          j++
          continue
        }
        if (line[j] === ch) {
          end = j
          break
        }
      }
      if (end === -1) return out
      out += line.slice(i, end + 1)
      i = end + 1
      continue
    }

    out += ch
    i++
  }

  return out
}

/**
 * The import block: everything above the first declaration, comments removed. Line
 * count is preserved so a statement spanning lines still reads as one.
 */
function importBlock(source: string, maxLines: number): string {
  const state = { inBlockComment: false }
  const lines: string[] = []

  for (const line of source.split('\n', maxLines)) {
    const code = stripComments(line, state)
    if (STOP_RE.test(code)) break
    lines.push(code)
  }

  return lines.join('\n')
}

/**
 * Anchored to the start of a line, which is where import and export statements live.
 * The clause body excludes backticks, parens and semicolons so a lazy match can't
 * run past its own statement, while still crossing the newlines of a multi-line
 * specifier list.
 */
const IMPORT_RE = new RegExp(
  [
    String.raw`^[ \t]*(?:import|export)\b[^'"\`;()]*?\bfrom\s*['"]([^'"\n]+)['"]`,
    String.raw`^[ \t]*import\s+['"]([^'"\n]+)['"]`,
  ].join('|'),
  'gm',
)

export interface ImportRef {
  source: string
  type: 'workspace' | 'local' | 'external'
}

export interface CollectImportsOptions {
  /**
   * Scopes belonging to this monorepo, e.g. `["@paladin"]`. Anything else scoped is
   * external — `@types/node` and `@babel/core` are not workspace packages.
   * Omitted, every scoped package counts as workspace.
   */
  workspaceScopes?: string[]
  /** Ceiling on lines read, for a file whose declarations never arrive. */
  maxLines?: number
}

/**
 * Every package or path a file imports, classified as 'local' (relative),
 * 'workspace' (a package in this monorepo) or 'external'. Bare specifiers collapse to
 * their package root, so `lodash/merge` and `lodash` are one entry; relative paths
 * stay whole. Builtins are dropped. First-seen order is preserved.
 *
 * Only static ESM syntax counts, and only within the import block — everything above
 * the first declaration, capped at `maxLines`. A fixture in a template literal, a
 * specifier built at runtime, or anything else below that point contributes nothing,
 * by construction rather than by pattern.
 */
export function collectImports(content: string, opts: CollectImportsOptions = {}): ImportRef[] {
  const { workspaceScopes, maxLines = DEFAULT_MAX_LINES } = opts
  const found = new Map<string, ImportRef>()

  for (const match of importBlock(content, maxLines).matchAll(IMPORT_RE)) {
    const spec = match[1] ?? match[2]
    if (!spec || isBuiltin(spec)) continue

    if (isRelative(spec)) {
      found.set(spec, { source: spec, type: 'local' })
      continue
    }

    const root = packageRoot(spec)
    if (found.has(root) || !isPackageName(root)) continue

    const workspace = workspaceScopes
      ? workspaceScopes.some((scope) => root.startsWith(`${scope}/`))
      : root.startsWith('@')

    found.set(root, { source: root, type: workspace ? 'workspace' : 'external' })
  }

  return [...found.values()]
}
