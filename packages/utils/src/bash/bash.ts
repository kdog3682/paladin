/*
  await bash(['bun', 'test'])
*/
import { parseTestSummary, type TestSummary } from './parseTestSummary'

export type BashType = 'test' | 'run' | 'install' | 'shell'

interface BashBase {
  stdout: string
  stderr: string
  exitCode: number
  args: string[]
  /* what kind of command this was, inferred from args */
  type: BashType
}

export type BashResult =
  | (BashBase & {
      type: 'test'
      /* the scraped run, or undefined when the tail held no summary */
      data?: TestSummary
    })
  | (BashBase & {
      type: Exclude<BashType, 'test'>
      /* jsonlike data extracted from the stdout */
      data?: unknown
    })

const BUN_VERSION_RE = /bun (?:test )?v[\d.]+\s*(?:\(.*?\))?/i
const BASH_DATA_RE = /<BASH>([\s\S]*?)<\/BASH>/g
const INSTALL_SUBCOMMANDS = new Set(['install', 'i', 'add', 'remove', 'rm', 'update', 'link'])
const MAX_DETAIL = 2000

function stripBunVersion(s: string): string {
  return s.trim().replace(BUN_VERSION_RE, '').trim()
}

function typeOf(args: string[]): BashType {
  const bin = args[0]?.split('/').pop() ?? ''
  if (bin === 'bunx') return 'run'
  if (bin !== 'bun') return 'shell'

  const sub = args.slice(1).find((arg) => !arg.startsWith('-'))
  if (!sub) return 'shell'
  if (sub === 'test') return 'test'
  if (INSTALL_SUBCOMMANDS.has(sub)) return 'install'
  return 'run'
}

function extractData(s: string): { text: string; data?: unknown } {
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
  if (found.length === 0) return { text }
  return { text, data: found.length === 1 ? found[0] : found }
}

function truncate(s: string, max = MAX_DETAIL): string {
  if (s.length <= max) return s
  return `${s.slice(0, max)}\n… ${s.length - max} more chars`
}

function formatSummary(summary: TestSummary): string {
  const lines = [summary.desc]
  for (const failure of summary.failures) {
    lines.push(`${failure.path} › ${failure.statement}`)
    if (failure.expected && !failure.expected.includes('\n')) {
      lines.push(`  expected: ${failure.expected}`)
    }
    if (failure.received && !failure.received.includes('\n')) {
      lines.push(`  received: ${failure.received}`)
    }
  }
  return lines.join('\n')
}

function formatMessage(result: BashResult): string {
  const head = `\`${result.args.join(' ')}\` exited with code ${result.exitCode}`
  const detail =
    result.type === 'test' && result.data
      ? formatSummary(result.data)
      : result.stderr.trim() || result.stdout.trim()
  return detail ? `${head}\n${truncate(detail)}` : head
}

export class BashError extends Error {
  readonly result: BashResult
  readonly stdout: string
  readonly stderr: string
  readonly exitCode: number
  readonly args: string[]
  readonly type: BashType
  readonly data?: unknown
  constructor(result: BashResult, options?: ErrorOptions) {
    super(formatMessage(result), options)
    this.name = 'BashError'
    this.result = result
    this.stdout = result.stdout
    this.stderr = result.stderr
    this.exitCode = result.exitCode
    this.args = result.args
    this.type = result.type
    this.data = result.data
    Error.captureStackTrace?.(this, BashError)
  }
  get summary(): TestSummary | null {
    return this.result.type === 'test' ? (this.result.data ?? null) : null
  }
  static is(e: unknown): e is BashError {
    return e instanceof BashError
  }
}

export async function bash(
  args: string[],
  opts: { strict?: boolean; cwd?: string; env?: Record<string, string> } = {}
): Promise<BashResult> {
  const proc = Bun.spawn(args, {
    cwd: opts.cwd,
    env: { ...process.env, ...opts.env },
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const [stdoutRaw, stderrRaw] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])
  const exitCode = await proc.exited
  const type = typeOf(args)
  const { text, data } = extractData(stripBunVersion(stdoutRaw))
  let stdout = text
  let stderr = stripBunVersion(stderrRaw)

  // bun writes the test tail to stderr, so scrape before it gets folded away
  const summary = type === 'test' ? parseTestSummary(stderr) : null

  if (exitCode === 0 && stderr) {
    stdout = stdout ? `${stdout}\n\n${stderr}` : stderr
    stderr = ''
  }

  const result: BashResult =
    type === 'test'
      ? { stdout, stderr, exitCode, args, type, data: summary ?? undefined }
      : { stdout, stderr, exitCode, args, type, data }

  if (exitCode !== 0 && opts.strict) {
    throw new BashError(result)
  }
  return result
}
