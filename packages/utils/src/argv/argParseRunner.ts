import { basename, extname } from "node:path"

export type ArgValueType = "string" | "number" | "boolean"

export type PositionalSpec = {
  name: string
  help?: string
  /* value used when the arg is omitted; without a fallback the arg is required */
  fallback?: unknown
  /* coercion type, inferred from fallback, else string */
  type?: ArgValueType
}

export type KwargSpec = {
  /* option name, passed as --name (camelCase names also accept --kebab-case) */
  name: string
  help?: string
  required?: boolean
  default?: unknown
  /* coercion type, inferred from default, else string */
  type?: ArgValueType
  /* single letter alias ie "n" for -n */
  alias?: string
}

export type RunnerSpec = {
  /* command name for the usage line, defaults to the script file name */
  name?: string
  /* one line description shown under the usage line */
  abstract?: string
  /* positional args, passed to fn in order */
  args?: PositionalSpec[]
  /* options, passed to fn as a trailing object */
  kwargs?: KwargSpec[]
}

class UsageError extends Error {}

const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase())

function typeOf(type: ArgValueType | undefined, sample: unknown): ArgValueType {
  if (type) return type
  if (typeof sample === "boolean") return "boolean"
  if (typeof sample === "number") return "number"
  return "string"
}

function coerce(raw: string, type: ArgValueType, label: string): unknown {
  if (type === "number") {
    const n = Number(raw)
    if (raw.trim() === "" || Number.isNaN(n)) throw new UsageError(`${label} expects a number, got "${raw}"`)
    return n
  }
  if (type === "boolean") {
    if (/^(true|1|yes|y)$/i.test(raw)) return true
    if (/^(false|0|no|n)$/i.test(raw)) return false
    throw new UsageError(`${label} expects a boolean, got "${raw}"`)
  }
  return raw
}

function scriptName(): string {
  const file = process.argv[1] ?? "command"
  return basename(file, extname(file))
}

function formatUsage(spec: RunnerSpec): string {
  const args = spec.args ?? []
  const kwargs = spec.kwargs ?? []
  const sig = [
    ...args.map((a) => ("fallback" in a ? `[${a.name}]` : `<${a.name}>`)),
    ...kwargs.map((k) => {
      const type = typeOf(k.type, k.default)
      const flag = type === "boolean" ? `--${kebab(k.name)}` : `--${kebab(k.name)} <${type}>`
      return k.required ? flag : `[${flag}]`
    }),
  ]
  const out = [`usage: ${spec.name ?? scriptName()} ${sig.join(" ")}`.trimEnd()]
  if (spec.abstract) out.push("", spec.abstract)

  const rows = (items: [string, string][]) => {
    const width = Math.max(...items.map(([l]) => l.length))
    return items.map(([l, h]) => `  ${l.padEnd(width)}  ${h}`.trimEnd())
  }

  if (args.length) {
    out.push("", "arguments:")
    out.push(
      ...rows(
        args.map((a) => {
          const extra = "fallback" in a ? ` (default: ${JSON.stringify(a.fallback)})` : " (required)"
          return [a.name, (a.help ?? "") + extra]
        }),
      ),
    )
  }

  out.push("", "options:")
  out.push(
    ...rows([
      ...kwargs.map((k): [string, string] => {
        const flag = [k.alias ? `-${k.alias}` : "", `--${kebab(k.name)}`].filter(Boolean).join(", ")
        const extra = k.required ? " (required)" : k.default !== undefined ? ` (default: ${JSON.stringify(k.default)})` : ""
        return [flag, (k.help ?? "") + extra]
      }),
      ["-h, --help", "show this help"],
    ]),
  )
  return out.join("\n")
}

/* argv -> [...positional, opts] as fn will receive them, throws UsageError */
function parseArgv(spec: RunnerSpec, argv: string[]): unknown[] {
  const args = spec.args ?? []
  const kwargs = spec.kwargs ?? []
  const byFlag = new Map<string, KwargSpec>()
  for (const k of kwargs) {
    byFlag.set(k.name, k)
    byFlag.set(kebab(k.name), k)
    if (k.alias) byFlag.set(k.alias, k)
  }

  const positional: string[] = []
  const opts: Record<string, unknown> = {}

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]
    if (token === "--") {
      positional.push(...argv.slice(i + 1))
      break
    }
    const m = token.match(/^--?(no-)?([^=]+)(?:=(.*))?$/)
    if (!m || /^-\d/.test(token)) {
      positional.push(token)
      continue
    }

    let kw = byFlag.get(m[1] ? `no-${m[2]}` : m[2])
    let negated = false
    if (!kw && m[1]) {
      kw = byFlag.get(m[2])
      negated = true
    }
    if (!kw) throw new UsageError(`unknown option ${token}`)

    const label = `--${kebab(kw.name)}`
    const type = typeOf(kw.type, kw.default)
    if (type === "boolean") {
      opts[kw.name] = m[3] !== undefined ? coerce(m[3], "boolean", label) : !negated
      continue
    }
    if (negated) throw new UsageError(`--no-${m[2]} is only valid for boolean options`)
    const raw = m[3] ?? argv[++i]
    if (raw === undefined) throw new UsageError(`${label} needs a value`)
    opts[kw.name] = coerce(raw, type, label)
  }

  if (positional.length > args.length) {
    throw new UsageError(`expected at most ${args.length} argument(s), got ${positional.length}: ${positional.join(" ")}`)
  }

  const values = args.map((a, i) => {
    if (i < positional.length) return coerce(positional[i], typeOf(a.type, a.fallback), a.name)
    if ("fallback" in a) return a.fallback
    throw new UsageError(`missing argument <${a.name}>`)
  })

  for (const k of kwargs) {
    if (k.name in opts) continue
    if (k.required) throw new UsageError(`missing option --${kebab(k.name)}`)
    if (k.default !== undefined) opts[k.name] = k.default
  }

  return [...values, opts]
}

function display(value: unknown): unknown {
  if (value && typeof value === "object" && value.toString !== Object.prototype.toString && !Array.isArray(value)) {
    return String(value)
  }
  return value
}

/* parse argv against spec, call fn(...args, opts) (sync or async) and console.log a defined return value */
export async function argParseRunner<R>(
  fn: (...args: any[]) => R | Promise<R>,
  spec: RunnerSpec = {},
  argv: string[] = process.argv.slice(2),
): Promise<Awaited<R> | undefined> {
  const usage = formatUsage(spec)
  if (argv.includes("-h") || argv.includes("--help")) {
    console.log(usage)
    return undefined
  }

  let callArgs: unknown[]
  try {
    callArgs = parseArgv(spec, argv)
  } catch (err) {
    if (!(err instanceof UsageError)) throw err
    console.error(`ERROR: ${err.message}\n\n${usage}`)
    process.exitCode = 1
    return undefined
  }

  try {
    const result = await fn(...callArgs)
    if (result !== undefined) console.log(display(result))
    return result
  } catch (err) {
    console.error("ERROR:", err)
    process.exitCode = 1
    return undefined
  }
}
