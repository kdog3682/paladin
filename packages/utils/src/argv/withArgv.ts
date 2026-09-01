/*
wraps a function so it can be invoked as a bun script.
  // runExamples.ts
  export default withArgv(runExampleFiles, { variadic: true })
  bun run runExamples.ts ./src/a.examples.ts ./src/b.examples.ts --opts '{"displayAll":true}'
each positional token is JSON.parse'd when possible, so numbers, booleans,
objects and arrays arrive typed and bare words arrive as strings.
a trailing `--opts <json>` (or --options, or --config, all the same thing) is
lifted out and handed over as the final argument, which keeps the positionals
variadic — a caller can pass one path or twenty without the options blob being
mistaken for another one.
the return value is printed between <BASH> markers so the caller can
slice it out of stdout without being confused by anything the example
itself logged.
*/
export const MARKER = "<BASH>"

const OPTS_FLAGS = new Set(["--opts", "--options", "--config"])

export function parseArg(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

export function extract(stdout: string): unknown {
  const start = stdout.indexOf(MARKER)
  const end = stdout.lastIndexOf(MARKER)
  if (start === -1 || start === end) throw new Error("no <BASH> payload in stdout")
  return JSON.parse(stdout.slice(start + MARKER.length, end))
}

function parseArgv(argv: string[]): { args: unknown[]; opts?: Record<string, unknown> } {
  const at = argv.findIndex((token) => OPTS_FLAGS.has(token))
  if (at === -1) return { args: argv.map(parseArg) }

  const flag = argv[at]
  const raw = argv[at + 1]
  if (raw === undefined) throw new Error(`${flag} expects a JSON object`)

  const parsed = parseArg(raw)
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${flag} expects a JSON object, got ${raw}`)
  }

  const rest = [...argv.slice(0, at), ...argv.slice(at + 2)]
  return { args: rest.map(parseArg), opts: parsed as Record<string, unknown> }
}

export interface WithArgvOptions {
  /** Collect the positionals into one array, for commands handed a batch of files. */
  variadic?: boolean
}

export function withArgv<A extends unknown[], R>(
  fn: (...args: A) => R | Promise<R>,
  { variadic }: WithArgvOptions = {},
) {
  return async () => {
    const { args, opts } = parseArgv(Bun.argv.slice(2))
    const positional = variadic ? [args] : args
    const applied = opts === undefined ? positional : [...positional, opts]
    const output = await fn(...(applied as A))
    if (typeof output === "string") {
      console.log(output)
    } else {
      console.log(`${MARKER}${JSON.stringify(output)}${MARKER}`)
    }
    return output
  }
}
