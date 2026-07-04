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

const IMPORT_RE =
  /\b(?:import|export)\s[^'"]*?\bfrom\s*['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)|\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)|\bimport\s+['"]([^'"]+)['"]/g

export interface ImportRef {
  source: string
  type: 'workspace' | 'local' | 'external'
}

// Extracts every imported package/path from a file's source and classifies each as
// 'local' (relative), 'workspace' (scoped, e.g. @paladin/x, @foobar/x), or 'external'.
export function collectImports(content: string): ImportRef[] {
  const found = new Map<string, ImportRef>()
  let m: RegExpExecArray | null
  while ((m = IMPORT_RE.exec(content)) !== null) {
    const spec = m[1] ?? m[2] ?? m[3] ?? m[4]
    if (!spec || isBuiltin(spec)) continue
    if (isRelative(spec)) {
      found.set(spec, { source: spec, type: 'local' })
      continue
    }
    const root = packageRoot(spec)
    if (!found.has(root)) {
      found.set(root, { source: root, type: root.startsWith('@') ? 'workspace' : 'external' })
    }
  }
  return [...found.values()]
}
