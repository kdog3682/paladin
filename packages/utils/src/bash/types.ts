import type { TestSummary } from './parseTestSummary'

/** What typeOf makes of the command: `bun test`, a bun install-ish subcommand, any other bun/bunx run, or anything else. */
export type BashType = 'test' | 'install' | 'run' | 'shell'

export interface BashOptions {
  cwd?: string
  /** Merged over process.env. */
  env?: Record<string, string>
  /** Throw with stderr on a non-zero exit. */
  strict?: boolean
}

export interface BashResult {
  args: string[]
  /** opts.cwd, or process.cwd() when none was given. */
  cwd: string
  strict: boolean
  /** Bun's version banner stripped, <BASH> payloads lifted out, and stderr folded in on success. */
  stdout: string
  /** Empty on success; see foldStderr. */
  stderr: string
  exitCode: number
  /** For `test`, the parsed TestSummary; otherwise the <BASH> payload(s), if any. */
  data?: TestSummary | unknown
}
