import { isAbsolute, relative } from 'node:path'
import { extractArtifactPaths } from './extractArtifactPaths'
import type { BashType } from './types'

const BUN_VERSION_RE = /bun (?:test )?v[\d.]+\s*(?:\(.*?\))?/i
const BASH_DATA_RE = /<BASH>\s*([\s\S]*?)\s*<\/BASH>/g
const INSTALL_SUBCOMMANDS = new Set(['install', 'i', 'add', 'remove', 'rm', 'update', 'link'])

export function stripBunVersion(s: string): string {
  return s.trim().replace(BUN_VERSION_RE, '').trim()
}

export function typeOf(args: string[]): BashType {
  const bin = args[0]?.split('/').pop() ?? ''
  if (bin === 'bunx') return 'run'
  if (bin !== 'bun') return 'shell'
  const sub = args.slice(1).find((arg) => !arg.startsWith('-'))
  if (!sub) return 'shell'
  if (sub === 'test') return 'test'
  if (INSTALL_SUBCOMMANDS.has(sub)) return 'install'
  return 'run'
}

/**
 * Lift structured data out of stdout. Explicit <BASH> payloads win; failing
 * that, a trailing run of logged paths collapses into artifactPaths and only
 * the prose above it is kept as text.
 */
export function extractData(s: string): { text: string; data?: unknown } {
  const found: unknown[] = []
  const text = s
    .replace(BASH_DATA_RE, (_, payload: string) => {
      try {
        found.push(JSON.parse(payload))
      } catch {
        found.push(payload)
      }
      return ''
    })
    .trim()
  if (found.length > 0) return { text, data: found.length === 1 ? found[0] : found }
  const artifacts = extractArtifactPaths(text)
  if (artifacts) return { text: artifacts.text, data: { artifactPaths: artifacts.paths } }
  return { text }
}

export function relativizeArgs(args: string[], cwd?: string): string[] {
  if (!cwd) return args
  return args.map((arg) => {
    if (!isAbsolute(arg)) return arg
    const rel = relative(cwd, arg)
    if (rel.startsWith('..')) return arg
    return rel === '' ? '.' : `./${rel}`
  })
}

/** bun writes warnings to stderr even on success, so fold them into stdout */
export function foldStderr(
  stdout: string,
  stderr: string,
  exitCode: number
): [string, string] {
  if (exitCode !== 0 || !stderr) return [stdout, stderr]
  return [stdout ? `${stdout}\n\n${stderr}` : stderr, '']
}
