/*
  await bash(['bun', 'test'])
*/
import { parseTestSummary } from './parseTestSummary'
import { extractData, foldStderr, stripBunVersion, typeOf } from './postProcess'
import type { BashOptions, BashResult } from './types'

export type { BashOptions, BashResult, BashType } from './types'

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
  const result: BashResult = {
    args,
    cwd: opts.cwd ?? process.cwd(),
    strict: opts.strict ?? false,
    stdout,
    stderr,
    exitCode,
    data: type === 'test' ? summary ?? undefined : data,
  }

  if (exitCode !== 0 && opts.strict) {
    throw new Error(result.stderr)
  }
  return result
}
