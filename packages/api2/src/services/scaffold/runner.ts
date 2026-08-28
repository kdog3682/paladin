import { extname } from "node:path"
import { classify, collectImports, resolveRelativePath, resolveScopedPath } from "@paladin/utils"
import { bashOp, contentOf, isSkip, isWrite } from "./ops"
import type { BashOp, FsOp, PathResolutionOpts, SkipOp, WriteOp } from "./types"

export const RUNNABLE_KINDS = ["test", "script", "story", "demo"] as const

export type RunnableKind = (typeof RUNNABLE_KINDS)[number]

const RUNNABLE = new Set<string>(RUNNABLE_KINDS)
const SOURCE = "codeRunner"

export interface Matcher {
  kind?: RunnableKind
  ext?: string
}

export interface Registration {
  /** Registering the same id again replaces the earlier one. */
  id?: string
  matches: Matcher
  /** Tokens: `<path>` for the file, `<opts>` for custom config, `@owner/pkg` for a scoped dir. */
  command: string
  /** Defaults to the kind, except stories, which run as demos. */
  purpose?: BashOp["purpose"]
  /** A failure here stops everything queued behind it. Off by default. */
  strict?: boolean
}

export interface RunOptions {
  cwd: string
  skip?: string[]
  /** Extra config for a registration, keyed by its id, serialized into `<opts>`. */
  custom?: Record<string, unknown>
  pathResolution?: PathResolutionOpts
}

function isRunnableKind(kind: string): kind is RunnableKind {
  return RUNNABLE.has(kind)
}

export function runnableKind(path: string): RunnableKind | null {
  const kind = classify(path)
  return isRunnableKind(kind) ? kind : null
}

function isSkipped(path: string, skip?: string[]): boolean {
  if (!skip?.length) return false
  return skip.some((entry) => path === entry || path.endsWith("/" + entry))
}

function importsOf(path: string, content: string): Set<string> {
  const paths = collectImports(content)
    .filter((ref) => ref.type === "local")
    .map((ref) => resolveRelativePath(ref.source, path))
    .filter((resolved): resolved is string => Boolean(resolved))
  return new Set(paths)
}

function purposeOf(registration: Registration, kind: RunnableKind): BashOp["purpose"] {
  if (registration.purpose) return registration.purpose
  return kind === "story" ? "demo" : kind
}

/**
 * `<path>` is the file, `<opts>` is that registration's custom config as JSON,
 * and a scoped `@owner/pkg` token becomes the directory it lives in.
 */
function toArgs(registration: Registration, path: string, opts: RunOptions): string[] {
  const custom = registration.id ? opts.custom?.[registration.id] : undefined

  return registration.command
    .split(" ")
    .filter(Boolean)
    .flatMap((part) => {
      if (part === "<path>") return [path]
      if (part === "<opts>") return custom === undefined ? [] : [JSON.stringify(custom)]
      if (part.startsWith("@")) return [resolveScopedPath(part, opts.pathResolution ?? {})]
      return [part]
    })
}

export class CodeRunner {
  private registrations: Registration[] = []
  private imports = new Map<string, Set<string>>()

  constructor(registrations: Registration[] = []) {
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

    const out: BashOp[] = []

    for (const path of targets) {
      if (isSkipped(path, opts.skip)) continue

      const kind = runnableKind(path)
      if (!kind) continue

      const registration = this.match(kind, extname(path).slice(1))
      if (!registration) continue

      out.push(
        bashOp(SOURCE, toArgs(registration, path, opts), purposeOf(registration, kind), {
          cwd: opts.cwd,
          strict: registration.strict ?? false,
        }),
      )
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

  private match(kind: RunnableKind, ext: string): Registration | null {
    for (let i = this.registrations.length - 1; i >= 0; i--) {
      const registration = this.registrations[i]
      if (!registration) continue

      const { matches } = registration
      if (matches.kind && matches.kind !== kind) continue
      if (matches.ext && matches.ext !== ext) continue
      return registration
    }
    return null
  }
}
