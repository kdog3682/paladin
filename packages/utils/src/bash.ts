/*
  await bash('bun', '<file') 
*/
export interface BashResult {
  stdout: string
  stderr: string
  exitCode: number
  args: string[]
  /* jsonlike data extracted from the stdout */
  data?: unknown
}

const BUN_VERSION_RE = /bun (?:test )?v[\d.]+\s*(?:\(.*?\))?/i
const BASH_DATA_RE = /<BASH>([\s\S]*?)<\/BASH>/g
const MAX_DETAIL = 2000

function stripBunVersion(s: string): string {
  return s.trim().replace(BUN_VERSION_RE, '').trim()
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

function formatMessage(result: BashResult): string {
  const head = `\`${result.args.join(' ')}\` exited with code ${result.exitCode}`
  const detail = result.stderr.trim() || result.stdout.trim()
  return detail ? `${head}\n${truncate(detail)}` : head
}

export class BashError extends Error {
  readonly result: BashResult
  readonly stdout: string
  readonly stderr: string
  readonly exitCode: number
  readonly args: string[]
  readonly data?: unknown

  constructor(result: BashResult, options?: ErrorOptions) {
    super(formatMessage(result), options)
    this.name = 'BashError'
    this.result = result
    this.stdout = result.stdout
    this.stderr = result.stderr
    this.exitCode = result.exitCode
    this.args = result.args
    this.data = result.data
    Error.captureStackTrace?.(this, BashError)
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
  const { text, data } = extractData(stripBunVersion(stdoutRaw))
  let stdout = text
  let stderr = stripBunVersion(stderrRaw)
  if (exitCode === 0 && stderr) {
    stdout = stdout ? `${stdout}\n\n${stderr}` : stderr
    stderr = ''
  }
  const result: BashResult = {
    stdout,
    stderr,
    exitCode,
    args,
    data,
  }
  if (exitCode !== 0 && opts.strict) {
    throw new BashError(result)
  }
  return result
}
