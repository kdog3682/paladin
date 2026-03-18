import { $ } from "bun"

export interface BashResult {
  stdout: string
  stderr: string
  exitCode: number
  cmd: string
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

function isGitSuccessStderr(stderr: string): boolean {
  const lines = stderr.trim().split("\n")
  return lines.every((line) =>
    GIT_SUCCESS_STDERR.some((re) => re.test(line.trim()))
  )
}

function isBunSuccessStderr(stderr: string): boolean {
  const lines = stderr.trim().split("\n")
  return lines.some((line) =>
    BUN_SUCCESS_STDERR.some((re) => re.test(line.trim()))
  )
}

export async function bash(
  cmd: string[],
  opts: { cwd?: string; env?: Record<string, string> } = {}
): Promise<BashResult> {
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

  // bun sometimes writes stdout content to stderr
  if (!stdout && stderr && exitCode === 0) {
    stdout = stderr
    stderr = ""
  }

  // git writes success info to stderr
  if (stderr && exitCode === 0 && isGitSuccessStderr(stderr)) {
    if (!stdout) stdout = stderr
    stderr = ""
  }

  // bun writes dependency resolution info to stderr
  if (stderr && exitCode === 0 && isBunSuccessStderr(stderr)) {
    if (!stdout) stdout = stderr
    stderr = ""
  }

  return {
    stdout,
    stderr,
    exitCode,
    cmd: cmd.join(" "),
  }
}
