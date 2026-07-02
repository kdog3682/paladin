// Import extraction (via es-module-lexer) + resolution. One raw-specifier
// primitive, two consumers with opposite filters:
//   collectImports -> external + workspace package ROOTS (for dep resolution)
//   resolveLocal   -> reachable local FILE paths (for closure/run invalidation)

import { join, dirname } from 'path'
import { existsSync, statSync } from 'fs'
import { init, parse } from 'es-module-lexer'

const RESOLVE_EXTS = ['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts']

const NODE_BUILTINS = new Set([
  'assert', 'async_hooks', 'buffer', 'child_process', 'cluster', 'console',
  'constants', 'crypto', 'dgram', 'diagnostics_channel', 'dns', 'domain',
  'events', 'fs', 'http', 'http2', 'https', 'inspector', 'module', 'net',
  'os', 'path', 'perf_hooks', 'process', 'punycode', 'querystring', 'readline',
  'repl', 'stream', 'string_decoder', 'sys', 'timers', 'tls', 'trace_events',
  'tty', 'url', 'util', 'v8', 'vm', 'wasi', 'worker_threads', 'zlib',
])
const BUN_BUILTINS = new Set(['bun'])

function isRelative(spec: string): boolean {
  return spec.startsWith('.') || spec.startsWith('/')
}

// reduces a specifier to its installable package root.
//   lodash/fp       -> lodash
//   @scope/pkg/sub  -> @scope/pkg
function packageRoot(spec: string): string {
  const segs = spec.split('/')
  if (spec.startsWith('@')) return segs.slice(0, 2).join('/')
  return segs[0]
}

function isBuiltin(spec: string): boolean {
  if (spec.startsWith('node:') || spec.startsWith('bun:')) return true
  const root = packageRoot(spec)
  return NODE_BUILTINS.has(root) || BUN_BUILTINS.has(root)
}

// Shared primitive: every literal specifier in a file, deduped. Dynamic imports
// with non-literal specifiers (imp.n undefined) are dropped — not statically
// resolvable, so neither consumer can act on them.
export async function extractSpecifiers(content: string): Promise<string[]> {
  await init
  const [imports] = parse(content)
  const specs = new Set<string>()
  for (const imp of imports) {
    if (imp.n) specs.add(imp.n)
  }
  return [...specs]
}

// External + workspace package roots (for the dependency resolver). Relatives
// and node/bun builtins excluded; specifiers reduced to install roots.
export async function collectImports(content: string): Promise<string[]> {
  const found = new Set<string>()
  for (const spec of await extractSpecifiers(content)) {
    if (isRelative(spec) || isBuiltin(spec)) continue
    found.add(packageRoot(spec))
  }
  return [...found]
}

function isFile(p: string): boolean {
  try {
    return statSync(p).isFile()
  } catch {
    return false
  }
}

// Tries a base path as a file (bare, then +ext), then as a dir index.
function probe(candidate: string): string | null {
  if (isFile(candidate)) return candidate
  for (const ext of RESOLVE_EXTS) {
    if (isFile(candidate + ext)) return candidate + ext
  }
  for (const ext of RESOLVE_EXTS) {
    const index = join(candidate, 'index' + ext)
    if (isFile(index)) return index
  }
  return null
}

// Resolves a specifier to a local source file, or null when external/builtin/
// unresolvable. base is expandHome(baseProjectDir), e.g. ~/projects.
//   relative './x'          -> resolved against fromFile's dir
//   workspace '@proj/pkg'   -> <base>/<proj>/packages/<pkg> (only if it exists)
//   bare 'react' / builtin  -> external -> null
// A scoped npm dep like '@bklearn/shadcn' has no local project 'bklearn', so
// the pkgDir check fails and it correctly falls through to external.
export function resolveLocal(spec: string, fromFile: string, base: string): string | null {
  if (isBuiltin(spec)) return null

  if (spec.startsWith('.')) {
    return probe(join(dirname(fromFile), spec))
  }

  if (spec.startsWith('@')) {
    const [proj, pkg, ...rest] = spec.slice(1).split('/')
    if (!proj || !pkg) return null
    const pkgDir = join(base, proj, 'packages', pkg)
    if (!existsSync(pkgDir)) return null
    if (rest.length) return probe(join(pkgDir, rest.join('/')))
    return probe(join(pkgDir, 'src', 'index')) ?? probe(join(pkgDir, 'index'))
  }

  return null
}
