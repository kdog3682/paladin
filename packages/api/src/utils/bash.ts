// @paladin/packages/api/src/utils/bash.ts

export interface BashResult {
  stdout: string
  stderr: string
  exitCode: number
  cmd: string[]
}

const BUN_VERSION_RE = /\nbun v[\d.]+\s*$/i

const GIT_SUCCESS_STDERR = [
  /^Switched to /,
  /^Already on /,
  /^Your branch is /,
  /^Everything up-to-date/,
  /^To https?:\/\//,
  /^\s*\w+\.\.\w+/,
  /^Enumerating objects/,
  /^Counting objects/,
  /^Compressing objects/,
  /^Writing objects/,
  /^remote:/,
]

const BUN_SUCCESS_STDERR = [
  /^Resolving dependencies$/,
  /^Resolved, downloaded and extracted/,
  /^Saved lockfile$/,
]

function stripBunVersion(s: string): string {
  return s.replace(BUN_VERSION_RE, "").trimEnd()
}

function isSuccessStderr(stderr: string): boolean {
  const lines = stderr.trim().split("\n")
  return lines.every((line) => {
    const trimmed = line.trim()
    return (
      GIT_SUCCESS_STDERR.some((re) => re.test(trimmed)) ||
      BUN_SUCCESS_STDERR.some((re) => re.test(trimmed))
    )
  })
}

export async function bash(
  cmdInput: string | string[],
  opts: { cwd?: string, env?: Record<string, string> } = {}
): Promise<BashResult> {
  const cmd = Array.isArray(cmdInput)
    ? cmdInput
    : cmdInput.trim().split(/\s+/).filter(Boolean)

  const proc = Bun.spawn(cmd, {
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

  if (!stdout && stderr && exitCode === 0) {
    stdout = stderr
    stderr = ""
  }

  if (stderr && exitCode === 0 && isSuccessStderr(stderr)) {
    if (!stdout) stdout = stderr
    stderr = ""
  }

  return {
    stdout,
    stderr,
    exitCode,
    cmd,
  }
}
