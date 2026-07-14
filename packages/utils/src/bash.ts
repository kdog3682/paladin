export interface BashResult {
  stdout: string
  stderr: string
  exitCode: number
  args: string[]
  data?: unknown
}

const BUN_VERSION_RE = /bun (?:test )?v[\d.]+\s*(?:\(.*?\))?/i
const BASH_DATA_RE = /<BASH>([\s\S]*?)<\/BASH>/g

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

export async function bash(
  args: string[],
  opts: { cwd?: string; env?: Record<string, string> } = {}
): Promise<BashResult> {
  const proc = Bun.spawn(args, {
    cwd: opts.cwd,
    env: { ...process.env, ...opts.env },
    stdout: "pipe",
    stderr: "pipe",
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

  return {
    stdout,
    stderr,
    exitCode,
    args,
    data,
  }
}
