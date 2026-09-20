/** one `--flag` in a command spec */
export type Kwarg = {
  /* placeholder shown in help, eg "sel" renders as `--click <sel>`; omit for a switch */
  arg?: string
  /* one line of help */
  help: string
  /* single-dash alias, written without the dash, eg "t" for `-t` */
  alias?: string
  /* sample value used in error hints, eg "500" renders as `try: web-probe --sleep 500` */
  eg?: string
  /* collect into the ordered `seq` instead of `kwargs`; repeats are kept in argv order */
  seq?: boolean
  /* value when the flag is absent; a switch defaults to false */
  default?: unknown
  /* turn the raw string into the final value; throw a plain Error to reject it */
  parse?: (raw: string) => unknown
}

/** one bare argument, matched by position */
export type Arg = {
  /* key it lands on in `args`, and the name shown in help */
  name: string
  /* one line of help */
  help: string
  /* may be left out */
  optional?: boolean
  /* swallow every remaining bare argument; only valid on the last one */
  rest?: boolean
  /* turn the raw string into the final value; throw a plain Error to reject it */
  parse?: (raw: string) => unknown
}

export type Spec = {
  /* the command as it is typed, eg "web-probe"; used in help and in every error hint */
  bin: string
  /* a paragraph under the usage line saying what the command does */
  intro?: string
  /* bare arguments, in positional order */
  args?: readonly Arg[]
  /* flags, in the order they should appear in help */
  kwargs?: Record<string, Kwarg>
}

type KwargsOf<S extends Spec> = S["kwargs"] extends Record<string, Kwarg> ? S["kwargs"] : {}
type ArgsOf<S extends Spec> = S["args"] extends readonly Arg[] ? S["args"] : []

type ValueOf<K extends Kwarg> = K extends { parse: (raw: string) => infer R }
  ? R
  : K extends { arg: string }
    ? string
    : boolean

type SeqKeys<K extends Record<string, Kwarg>> = {
  [N in keyof K]: K[N] extends { seq: true } ? N : never
}[keyof K]
type FlatKeys<K extends Record<string, Kwarg>> = Exclude<keyof K, SeqKeys<K>>
type Filled<K extends Kwarg> = K extends { default: unknown }
  ? true
  : K extends { arg: string }
    ? false
    : true

/** the union of single-key objects a `seq: true` flag set produces, eg `{click: string}` */
export type SeqItem<K extends Record<string, Kwarg>> = {
  [N in SeqKeys<K>]: { [P in N]: ValueOf<K[N]> }
}[SeqKeys<K>]

/** the record every non-seq flag produces; flags without a default are optional */
export type KwargValues<K extends Record<string, Kwarg>> = {
  [N in FlatKeys<K> as Filled<K[N]> extends true ? N : never]: ValueOf<K[N]>
} & {
  [N in FlatKeys<K> as Filled<K[N]> extends true ? never : N]?: ValueOf<K[N]>
}

type ArgValue<A extends Arg> = A extends { parse: (raw: string) => infer R }
  ? A extends { rest: true }
    ? R[]
    : R
  : A extends { rest: true }
    ? string[]
    : string

/** the record the bare arguments produce; a `rest` one is always present, possibly empty */
export type ArgValues<A extends readonly Arg[]> = {
  [K in A[number] as K extends { optional: true }
    ? K extends { rest: true }
      ? K["name"]
      : never
    : K["name"]]: ArgValue<K>
} & {
  [K in A[number] as K extends { optional: true }
    ? K extends { rest: true }
      ? never
      : K["name"]
    : never]?: ArgValue<K>
}

export type Parsed<S extends Spec> = {
  /* the bare arguments */
  args: ArgValues<ArgsOf<S>>
  /* every non-seq flag, with defaults applied */
  kwargs: KwargValues<KwargsOf<S>>
  /* every seq flag, in the order it was given on the command line */
  seq: SeqItem<KwargsOf<S>>[]
}

/** a bad invocation. `hint` is a corrected command line the caller can copy verbatim. */
export class ArgvError extends Error {
  hint: string | undefined

  constructor(message: string, hint?: string) {
    super(message)
    this.name = "ArgvError"
    this.hint = hint
  }
}

/** thrown when -h/--help was given, so the caller prints help and exits 0 */
export class ArgvHelp extends Error {
  constructor() {
    super("help")
    this.name = "ArgvHelp"
  }
}

/** the invocation was wrong, as distinct from the command running and failing */
export const EXIT_USAGE = 2

const HELP = new Set(["-h", "--help"])
const HELP_ROW: Row = ["-h, --help", "show this"]

type Row = [label: string, help: string]
type Section = { title: string; rows: Row[] }

/** `--click <sel>`, or `-t, --timeout <ms>` when the flag has an alias */
function label(name: string, kwarg: Kwarg) {
  const long = kwarg.arg ? `--${name} <${kwarg.arg}>` : `--${name}`
  return kwarg.alias ? `-${kwarg.alias}, ${long}` : long
}

/** the shortest correct way to write this flag, used as the `try:` line on errors */
function example(bin: string, name: string, kwarg: Kwarg) {
  if (!kwarg.arg) return `${bin} --${name}`
  return `${bin} --${name} ${kwarg.eg ?? `<${kwarg.arg}>`}`
}

/** `web-probe <url> [kwargs...]` */
export function usageLine(spec: Spec) {
  const parts = [spec.bin]
  for (const a of spec.args ?? []) {
    if (a.rest) parts.push(`[${a.name}...]`)
    else parts.push(a.optional ? `[${a.name}]` : `<${a.name}>`)
  }
  parts.push(Object.keys(spec.kwargs ?? {}).length ? "[kwargs...]" : "[-h]")
  return parts.join(" ")
}

export function helpText(spec: Spec) {
  const sections: Section[] = []
  const args = spec.args ?? []

  if (args.length) {
    sections.push({
      title: "args:",
      rows: args.map((a): Row => [a.rest ? `${a.name}...` : a.name, a.help]),
    })
  }

  const kwargs = Object.entries(spec.kwargs ?? {}).map(([name, kwarg]): Row => {
    const suffix = kwarg.default === undefined ? "" : ` (default ${kwarg.default})`
    return [label(name, kwarg), kwarg.help + suffix]
  })
  sections.push({ title: "kwargs:", rows: [...kwargs, HELP_ROW] })

  const width = Math.max(...sections.flatMap((s) => s.rows.map(([text]) => text.length)))
  const out = [`usage: ${usageLine(spec)}`]
  if (spec.intro) out.push("", spec.intro)
  for (const s of sections) {
    out.push("", s.title)
    for (const [text, help] of s.rows) out.push(`  ${text.padEnd(width)}  ${help}`)
  }
  return out.join("\n")
}

/**
 * Turn an argv slice into `{args, kwargs, seq}` per the spec.
 *
 * Every failure is an {@link ArgvError} carrying a corrected command line, and
 * anything ambiguous fails rather than guessing: a missing value, a flag where a
 * value should be, an unknown flag, a value the flag's `parse` rejects, a bare
 * argument with nowhere to go. `-h`/`--help` throws {@link ArgvHelp}.
 */
export function parseArgv<const S extends Spec>(spec: S, argv: readonly string[]): Parsed<S> {
  const kwargSpecs = (spec.kwargs ?? {}) as Record<string, Kwarg>
  const argSpecs = (spec.args ?? []) as readonly Arg[]
  const names = Object.keys(kwargSpecs)
  const aliases = new Map<string, string>()
  for (const name of names) {
    const alias = kwargSpecs[name]!.alias
    if (alias) aliases.set(alias, name)
  }

  const kwargs: Record<string, unknown> = {}
  const seq: Record<string, unknown>[] = []
  const bare: string[] = []

  for (const name of names) {
    const kwarg = kwargSpecs[name]!
    if (kwarg.seq) continue
    if (kwarg.default !== undefined) kwargs[name] = kwarg.default
    else if (!kwarg.arg) kwargs[name] = false
  }

  let bareOnly = false
  for (let i = 0; i < argv.length; i++) {
    const raw = argv[i]!
    if (bareOnly || raw === "-" || !raw.startsWith("-")) {
      bare.push(raw)
      continue
    }
    if (raw === "--") {
      bareOnly = true
      continue
    }
    if (HELP.has(raw)) throw new ArgvHelp()

    const eq = raw.indexOf("=")
    const token = eq === -1 ? raw : raw.slice(0, eq)
    const inline = eq === -1 ? undefined : raw.slice(eq + 1)
    const name = token.startsWith("--") ? token.slice(2) : aliases.get(token.slice(1))
    const kwarg = name === undefined ? undefined : kwargSpecs[name]
    if (name === undefined || kwarg === undefined) throw unknownFlag(spec, token, names)

    if (!kwarg.arg) {
      if (inline !== undefined) {
        throw new ArgvError(`--${name} is a switch and takes no value`, `${spec.bin} --${name}`)
      }
      kwargs[name] = true
      continue
    }

    const value = inline ?? argv[++i]
    if (value === undefined) {
      throw new ArgvError(
        `${label(name, kwarg)} is missing its value`,
        example(spec.bin, name, kwarg),
      )
    }
    if (inline === undefined && isKnownFlag(value, kwargSpecs, aliases)) {
      throw new ArgvError(
        `--${name} swallowed ${quote(value)} as its <${kwarg.arg}>, but that is a flag`,
        `${spec.bin} --${name} ${kwarg.eg ?? `<${kwarg.arg}>`} ${value} ...  (or --${name}=${value} if it really is the value)`,
      )
    }

    const parsed = coerce(label(name, kwarg), example(spec.bin, name, kwarg), kwarg.parse, value)
    if (kwarg.seq) seq.push({ [name]: parsed })
    else kwargs[name] = parsed
  }

  const args: Record<string, unknown> = {}
  let at = 0
  for (const a of argSpecs) {
    if (a.rest) {
      const hint = usageLine(spec)
      args[a.name] = bare.slice(at).map((v) => coerce(`<${a.name}>`, hint, a.parse, v))
      at = bare.length
      continue
    }
    const value = bare[at]
    if (value === undefined) {
      if (a.optional) continue
      throw new ArgvError(`<${a.name}> is required — ${a.help}`, usageLine(spec))
    }
    args[a.name] = coerce(`<${a.name}>`, usageLine(spec), a.parse, value)
    at++
  }
  if (at < bare.length) {
    const extra = bare.slice(at)
    const plural = extra.length > 1 ? "s" : ""
    const them = extra.length > 1 ? "them" : "it"
    throw new ArgvError(
      `unexpected argument${plural} ${extra.map(quote).join(", ")} — nothing takes ${them}`,
      usageLine(spec),
    )
  }

  return { args, kwargs, seq } as Parsed<S>
}

/**
 * Parse argv, hand the result to `body`, and turn everything into an exit code:
 * 0 on success or `--help`, 2 on a bad invocation, 1 on a thrown error or a
 * number returned by `body`. Nothing here exits the process, so the caller keeps
 * control and this stays testable.
 */
export async function runArgv<const S extends Spec>(
  spec: S,
  argv: readonly string[],
  body: (parsed: Parsed<S>) => number | void | Promise<number | void>,
) {
  let parsed: Parsed<S>
  try {
    parsed = parseArgv(spec, argv)
  } catch (e) {
    if (e instanceof ArgvHelp) {
      console.log(helpText(spec))
      return 0
    }
    if (e instanceof ArgvError) {
      console.error(`error: ${e.message}`)
      if (e.hint) console.error(`  try: ${e.hint}`)
      console.error("")
      console.error(helpText(spec))
      return EXIT_USAGE
    }
    throw e
  }

  try {
    return (await body(parsed)) ?? 0
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e))
    return 1
  }
}

function coerce(
  what: string,
  hint: string,
  parse: ((raw: string) => unknown) | undefined,
  raw: string,
) {
  if (!parse) return raw
  try {
    return parse(raw)
  } catch (e) {
    throw new ArgvError(`${what}: ${e instanceof Error ? e.message : String(e)}`, hint)
  }
}

function isKnownFlag(value: string, kwargs: Record<string, Kwarg>, aliases: Map<string, string>) {
  if (!value.startsWith("-") || value === "-" || value === "--") return false
  const token = value.split("=")[0]!
  if (HELP.has(token)) return true
  if (token.startsWith("--")) return token.slice(2) in kwargs
  return aliases.has(token.slice(1))
}

function unknownFlag(spec: Spec, token: string, names: readonly string[]) {
  const guess = nearest(token.replace(/^-+/, ""), names)
  const kwarg = guess === undefined ? undefined : spec.kwargs?.[guess]
  if (guess !== undefined && kwarg !== undefined) {
    return new ArgvError(
      `unknown option ${token} — did you mean --${guess}?`,
      example(spec.bin, guess, kwarg),
    )
  }
  return new ArgvError(`unknown option ${token}`, usageLine(spec))
}

function quote(value: string) {
  return JSON.stringify(value)
}

/** the closest candidate within `max` edits, for turning a typo into a "try:" line */
function nearest(word: string, candidates: readonly string[], max = 3) {
  let best: string | undefined
  let score = max + 1
  for (const c of candidates) {
    const d = distance(word, c)
    if (d < score) {
      score = d
      best = c
    }
  }
  return best
}

function distance(a: string, b: string) {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const row = [i]
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      row.push(Math.min(row[j - 1]! + 1, prev[j]! + 1, prev[j - 1]! + cost))
    }
    prev = row
  }
  return prev[b.length]!
}

export type IntOpts = {
  /* smallest accepted value */
  min?: number
  /* largest accepted value */
  max?: number
}

/** a whole number. Rejects "", NaN, decimals and out-of-range values. */
export function int(opts: IntOpts = {}) {
  return (raw: string) => {
    if (raw.trim() === "") throw new Error("expected a whole number, got nothing")
    const n = Number(raw)
    if (!Number.isInteger(n)) throw new Error(`expected a whole number, got ${quote(raw)}`)
    if (opts.min !== undefined && n < opts.min) throw new Error(`must be at least ${opts.min}, got ${n}`)
    if (opts.max !== undefined && n > opts.max) throw new Error(`must be at most ${opts.max}, got ${n}`)
    return n
  }
}

/** one of a fixed set of words, narrowed to that union */
export function oneOf<const T extends readonly string[]>(values: T) {
  return (raw: string) => {
    if (!values.includes(raw)) {
      throw new Error(`expected one of ${values.join(", ")}, got ${quote(raw)}`)
    }
    return raw as T[number]
  }
}
