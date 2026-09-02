/*
  await bash(['bun', 'test'])
*/
import { BashError } from './BashError'
import { parseTestSummary } from './parseTestSummary'
import { extractData, foldStderr, relativizeArgs, stripBunVersion, typeOf } from './postProcess'
import type { BashOptions, BashResult } from './types'

export async function bash(args: string[], opts: BashOptions = {}): Promise<BashResult> {
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

  // bun writes the test tail to stderr, so scrape before it gets folded away
  const rawStderr = stripBunVersion(stderrRaw)
  const summary = type === 'test' ? parseTestSummary(rawStderr) : null

  const [stdout, stderr] = foldStderr(text, rawStderr, exitCode)
  const resultArgs = relativizeArgs(args, opts.cwd)

  const result: BashResult =
    type === 'test'
      ? { stdout, stderr, exitCode, args: resultArgs, type, data: summary ?? undefined }
      : { stdout, stderr, exitCode, args: resultArgs, type, data }

  if (exitCode !== 0 && opts.strict) {
    throw new Error(result.stderr)
  }
  return result
}
