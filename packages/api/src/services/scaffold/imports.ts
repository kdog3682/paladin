import { init, parse } from 'es-module-lexer'

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

const STATIC_IMPORT_RE = /\bfrom\s+['"]([^'"]+)['"]/g

function collectImportsRegex(content: string): string[] {
  const found = new Set<string>()
  let m: RegExpExecArray | null
  while ((m = STATIC_IMPORT_RE.exec(content)) !== null) {
    const spec = m[1]
    if (isRelative(spec) || isBuiltin(spec)) continue
    found.add(packageRoot(spec))
  }
  return [...found]
}

// collects external + workspace package roots from a file's content using
// es-module-lexer. falls back to regex for files with JSX or other syntax
// the lexer can't handle. relative imports and node/bun builtins are excluded.
export async function collectImports(content: string): Promise<string[]> {
  await init
  try {
    const [imports] = parse(content)
    const found = new Set<string>()
    for (const imp of imports) {
      const spec = imp.n
      if (!spec) continue // dynamic import with a non-literal specifier
      if (isRelative(spec) || isBuiltin(spec)) continue
      found.add(packageRoot(spec))
    }
    return [...found]
  } catch {
    return collectImportsRegex(content)
  }
}
