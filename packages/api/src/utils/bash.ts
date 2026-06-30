// /home/kdog3682/projects/paladin/packages/api/src/utils/bash.ts
export interface BashResult {
  stdout: string
  stderr: string
  exitCode: number
  args: string[]
}
const BUN_VERSION_RE = /bun (?:test )?v[\d.]+\s*(?:\(.*?\))?/i

function stripBunVersion(s: string): string {
  return s.trim().replace(BUN_VERSION_RE, '').trim()
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
  let stdout = stripBunVersion(stdoutRaw)
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
  }
}