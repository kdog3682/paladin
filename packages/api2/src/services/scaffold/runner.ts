import { extname, join } from "node:path"
import { classify, collectImports, resolveRelativePath, resolveScopedPath } from "@paladin/utils"
import { bashOp, contentOf, isSkip, isWrite } from "./ops"
import type { BashOp, FsOp, PathResolutionOpts, SkipOp, WriteOp } from "./types"

const SOURCE = "codeRunner"

/** Trails the paths, so the path list stays variadic. withArgv reads it back. */
const OPTS_FLAG = "--opts"

export interface Matcher {
  /** Compared against `classify(path)`. The registered kinds are what make a file runnable. */
  kind: string
  ext?: string
}

export interface Registration {
  /** Registering the same id again replaces the earlier one, and keys `scopedRunOptions`. */
  id?: string
  matches: Matcher
  /**
   * Paths and options are appended automatically, so a command is usually just the
   * executable. Use `<path>`/`<paths>` or `<opts>` only to place them somewhere other
   * than the end. `@owner/pkg` becomes the directory it lives in.
   */
  command: string
  /** Defaults to the matched kind. */
  purpose?: BashOp["purpose"]
  /** A failure here stops everything queued behind it. Off by default. */
  strict?: boolean
  /** One run over every matched file, instead of a run per file. */
  grouped?: boolean
  /**
   * Whether the command understands an options flag. Off by default, since a
   * native binary like `bun test` would choke on it. An explicit `<opts>` token
   * counts as opting in.
   */
  acceptsOptions?: boolean
  /** Baseline options, overlaid by `scopedRunOptions[id]`. Ignored unless accepted. */
  options?: Record<string, unknown>
}

export interface RunOptions {
  cwd: string
  /** Keyed by registration id; merged over that registration's own `options`. */
  scopedRunOptions?: Record<string, Record<string, unknown>>
  /** Registration ids to leave out of this run. */
  disabled?: string[]
  pathResolution?: PathResolutionOpts
}

export const DEFAULT_REGISTRATIONS: Registration[] = [
  { id: "test-ts", matches: { kind: "test", ext: "ts" }, command: "bun test", grouped: true },
  { id: "test-tsx", matches: { kind: "test", ext: "tsx" }, command: "bun test --preload ./happydom.ts", grouped: true },
  { id: "script", matches: { kind: "script" }, command: "bun run" },
  { id: "demo", matches: { kind: "demo" }, command: "bun run" },
  {
    id: "story",
    matches: { kind: "story", ext: "tsx" },
    command: "bun run @paladin/storylite",
    purpose: "demo",
    acceptsOptions: true,
    enabled: false, // TODO
  },
  {
    id: "example",
    matches: { kind: "example" },
    command: `bun run @paladin/exemplar/cli.ts`,
    purpose: "example",
    grouped: true,
    acceptsOptions: true,
  },
  {
    id: "recast-spec",
    matches: { kind: "recast-spec" },
    command: `bun run @paladin/recast/runner.ts`,
    purpose: "script",
  },
  {
    id: "codemod",
    matches: { kind: "codemod" },
    command: `bun run @paladin/codemod/test.ts`,
    purpose: "test",
  },
]

const DEFAULT_KINDS = new Set(DEFAULT_REGISTRATIONS.map((registration) => registration.matches.kind))

/**
 * Path patterns matched directly, ahead of classify(). classify() only
 * knows the kinds in rules.json, so anything runnable that lives outside
 * that scheme (a suffix like `.examples.ts`, a directory like recast's
 * specs/) needs an entry here instead.
 */
const PATTERN_KINDS: { kind: string; pattern: RegExp }[] = [
  { kind: "example", pattern: /\.examples\.\w+$/ },
  { kind: "recast-spec", pattern: /(^|\/)packages\/recast\/src\/specs\// },
  // a transform, a command, or a file of the corpus they are tested against (classify() calls those "corpus")
  {
    kind: "codemod",
    pattern: /(^|\/)packages\/codemod\/(src\/(transforms|commands)\/[^/]+|corpus\/[^/]+\/(input|output))\.ts$/,
  },
]

/** Whether `path` is runnable under the default registrations, independent of any CodeRunner instance. */
export function runnableKind(path: string): string | null {
  for (const { kind, pattern } of PATTERN_KINDS) {
    if (pattern.test(path)) return kind
  }
  const kind = classify(path)
  return DEFAULT_KINDS.has(kind) ? kind : null
}

function importsOf(path: string, content: string): Set<string> {
  const paths = collectImports(content)
    .filter((ref) => ref.type === "local")
    .map((ref) => resolveRelativePath(ref.source, path))
    .filter((resolved): resolved is string => Boolean(resolved))
  return new Set(paths)
}

function acceptsOptions(registration: Registration): boolean {
  return registration.acceptsOptions ?? registration.command.includes("<opts>")
}

function payloadOf(registration: Registration, opts: RunOptions): string | null {
  if (!acceptsOptions(registration)) return null

  const scoped = registration.id ? opts.scopedRunOptions?.[registration.id] : undefined
  const merged = { ...registration.options, ...scoped }
  return Object.keys(merged).length ? JSON.stringify(merged) : null
}

function purposeOf(registration: Registration): BashOp["purpose"] {
  return registration.purpose ?? (registration.matches.kind as BashOp["purpose"])
}

function toArgs(registration: Registration, paths: string[], opts: RunOptions): string[] {
  const payload = payloadOf(registration, opts)
  let placedPaths = false
  let placedOpts = false

  const args = registration.command
    .split(" ")
    .filter(Boolean)
    .flatMap((part) => {
      if (part === "<path>" || part === "<paths>") {
        placedPaths = true
        return paths
      }
      if (part === "<opts>") {
        placedOpts = true
        return payload === null ? [] : [OPTS_FLAG, payload]
      }
      if (part.startsWith("@")) return [resolveScopedPath(part, opts.pathResolution ?? {})]
      return [part]
    })

  if (!placedPaths) args.push(...paths)
  if (!placedOpts && payload !== null) args.push(OPTS_FLAG, payload)
  return args
}

export class CodeRunner {
  private registrations: Registration[] = []
  private imports = new Map<string, Set<string>>()

  constructor(registrations: Registration[] = DEFAULT_REGISTRATIONS) {
    for (const registration of registrations) this.register(registration)
  }

  register(registration: Registration): this {
    const at = registration.id
      ? this.registrations.findIndex((existing) => existing.id === registration.id)
      : -1

    if (at >= 0) this.registrations[at] = registration
    else this.registrations.push(registration)
    return this
  }

  /**
   * Every runnable in the batch runs, changed or not, and a changed file drags
   * in the runnables that import it. Returns the commands; running them is
   * apply's job.
   */
  run(ops: FsOp[], opts: RunOptions): BashOp[] {
    const touched = ops.filter((op): op is WriteOp | SkipOp => isWrite(op) || isSkip(op))
    const targets = new Set<string>()

    // index first, so a changed file can find importers that appear later in the batch
    for (const op of touched) {
      if (!runnableKind(op.path)) continue
      const content = contentOf(op)
      if (content !== null) this.imports.set(op.path, importsOf(op.path, content))
    }

    for (const op of touched) {
      if (runnableKind(op.path)) {
        targets.add(op.path)
        continue
      }
      // a skip is unchanged, so nothing downstream of it needs rerunning
      if (isSkip(op)) continue
      for (const runnable of this.importers(op.path)) targets.add(runnable)
    }

    const disabled = new Set(opts.disabled ?? [])
    const groups = new Map<Registration, string[]>()

    for (const path of targets) {
      const kind = runnableKind(path)
      if (!kind) continue

      const registration = this.match(kind, extname(path).slice(1))
      if (!registration) continue
      if (registration.id && disabled.has(registration.id)) continue

      const group = groups.get(registration)
      if (group) group.push(path)
      else groups.set(registration, [path])
    }

    const out: BashOp[] = []

    for (const [registration, paths] of groups) {
      const batches = registration.grouped ? [paths] : paths.map((path) => [path])

      for (const batch of batches) {
        out.push(
          bashOp(SOURCE, toArgs(registration, batch, opts), purposeOf(registration), {
            cwd: opts.cwd,
            strict: registration.strict ?? false,
          }),
        )
      }
    }

    return out
  }

  private importers(path: string): string[] {
    const out: string[] = []
    for (const [runnable, imports] of this.imports) {
      if (imports.has(path)) out.push(runnable)
    }
    return out
  }

  private match(kind: string, ext: string): Registration | null {
    for (let i = this.registrations.length - 1; i >= 0; i--) {
      const registration = this.registrations[i]
      if (!registration) continue

      const { matches } = registration
      if (matches.kind !== kind) continue
      if (matches.ext && matches.ext !== ext) continue
      return registration
    }
    return null
  }
}
