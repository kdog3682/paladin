import type {
  BashOp,
  DeleteOp,
  DeprecatedOp,
  FsOp,
  PathOp,
  SkipOp,
  WriteMode,
  WriteOp,
} from "./types"

/** Writes land first, then installs, then everything that depends on an install. */
export const BASH_ORDER = ["install", "bin", "test", "demo", "example", "script", "build"] as const

export const isWrite = (op: FsOp): op is WriteOp => op.kind === "write"
export const isBash = (op: FsOp): op is BashOp => op.kind === "bash"
export const isDelete = (op: FsOp): op is DeleteOp => op.kind === "delete"
export const isSkip = (op: FsOp): op is SkipOp => op.kind === "skip"
export const isDeprecated = (op: FsOp): op is DeprecatedOp => op.kind === "deprecated"
export const isPathOp = (op: FsOp): op is PathOp => !isBash(op)

const FIXTURE_PATH = /\.fixture\.|(^|\/)fixtures\//

/** Fixtures are test data: written as-is, never barrelled, hydrated, dependency-scanned or run. */
export const isFixtureOp = (op: FsOp): boolean => {
  const path = pathOf(op)
  return path !== null && FIXTURE_PATH.test(path)
}

/** The path an op addresses, or null for bash — its target lives in the args. */
export function pathOf(op: FsOp): string | null {
  return isBash(op) ? null : op.path
}

/** Content an op carries: writes always, skips when it was cheap to keep. */
export function contentOf(op: FsOp): string | null {
  if (isWrite(op)) return op.content
  if (isSkip(op)) return op.content ?? null
  return null
}

export function write(
  source: string,
  path: string,
  content: string,
  mode: WriteMode = "write",
): WriteOp {
  return { kind: "write", source, path, content, mode }
}

export function append(source: string, path: string, content: string): WriteOp {
  return write(source, path, content, "append")
}

export function merge(source: string, path: string, content: string): WriteOp {
  return write(source, path, content, "merge")
}

export function remove(source: string, path: string): DeleteOp {
  return { kind: "delete", source, path }
}

export function skip(source: string, path: string, reason?: string, content?: string): SkipOp {
  return { kind: "skip", source, path, reason, content }
}

export function deprecate(source: string, path: string): DeprecatedOp {
  return { kind: "deprecated", source, path }
}

export function bashOp(
  source: string,
  args: string[],
  purpose: BashOp["purpose"],
  opts: { cwd: string; strict?: boolean },
): BashOp {
  return { kind: "bash", source, args, purpose, cwd: opts.cwd, strict: opts.strict ?? false }
}

/** Stable identity for a command, used to drop duplicates while merging. */
export function bashKey(op: BashOp): string {
  return `${op.cwd}\u0000${op.args.join(" ")}`
}

export function byPurpose(a: BashOp, b: BashOp): number {
  return BASH_ORDER.indexOf(a.purpose) - BASH_ORDER.indexOf(b.purpose)
}
