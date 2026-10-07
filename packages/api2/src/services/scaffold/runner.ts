// @paladin/api2/src/services/scaffold/runner.ts
import { basename, dirname } from "node:path"
import { collectImports, resolveRelativePath } from "@paladin/utils"
import { matches, matchesAny } from "./matcher"
import { bashOp, contentOf, isSkip, isWrite } from "./ops"
import { DEFAULT_REGISTRATIONS, type Registration } from "./registrations"
import type { BashOp, FsOp, SkipOp, WriteOp } from "./types"

export { DEFAULT_REGISTRATIONS, type Registration } from "./registrations"

const SOURCE = "codeRunner"

export interface RunOptions {
  cwd: string
  /** Registration ids to leave out of this run. */
  disabled?: string[]
}

/** Whether `path` is runnable under the default registrations, independent of any CodeRunner instance. */
export function isRunnable(path: string): boolean {
  return matchesAny(
    DEFAULT_REGISTRATIONS.map((registration) => registration.matches),
    path,
  )
}

function importsOf(path: string, content: string): Set<string> {
  const paths = collectImports(content)
    .filter((ref) => ref.type === "local")
    .map((ref) => resolveRelativePath(ref.source, path))
    .filter((resolved): resolved is string => Boolean(resolved))
  return new Set(paths)
}

/** Whether this op is a package.json with a non-empty `test` script. */
function hasTestScript(op: WriteOp | SkipOp): boolean {
  if (basename(op.path) !== "package.json") return false
  const content = contentOf(op)
  if (content === null) return false
  try {
    const script = JSON.parse(content)?.scripts?.test
    return typeof script === "string" && script.trim() !== ""
  } catch {
    return false
  }
}

/** `{ key: "value", flag: true }` -> `["--key", "value", "--flag"]`; `false` drops the flag. */
function serializeOpts(opts: Registration["opts"] = {}): string[] {
  return Object.entries(opts).flatMap(([key, value]) => {
    if (value === false) return []
    if (value === true) return [`--${key}`]
    return [`--${key}`, value]
  })
}

export class CodeRunner {
  private registrations: Registration[] = []
  private imports = new Map<string, Set<string>>()

  constructor(registrations: Registration[] = DEFAULT_REGISTRATIONS) {
    for (const registration of registrations) this.register(registration)
  }

  register(registration: Registration): this {
    this.registrations.push(registration)
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
      if (!isRunnable(op.path)) continue
      const content = contentOf(op)
      if (content !== null) this.imports.set(op.path, importsOf(op.path, content))
    }

    for (const op of touched) {
      if (isRunnable(op.path)) {
        targets.add(op.path)
        continue
      }
      // a skip is unchanged, so nothing downstream of it needs rerunning
      if (isSkip(op)) continue
      for (const runnable of this.importers(op.path)) targets.add(runnable)
    }

    // a package that declares its own test script runs that, and its test files aren't run individually
    const packageDirs = touched.filter(hasTestScript).map((op) => dirname(op.path))
    const inPackage = (path: string) => packageDirs.some((dir) => path.startsWith(dir + "/"))

    const disabled = new Set(opts.disabled ?? [])
    const groups = new Map<Registration, string[]>()

    for (const path of targets) {
      const registration = this.match(path, disabled)
      if (!registration) continue
      if (registration.purpose === "test" && inPackage(path)) continue

      const group = groups.get(registration)
      if (group) group.push(path)
      else groups.set(registration, [path])
    }

    const out: BashOp[] = []

    for (const [registration, paths] of groups) {
      const batches = registration.grouped ? [paths] : paths.map((path) => [path])

      for (const batch of batches) {
        out.push(
          bashOp(SOURCE, [...registration.command, ...serializeOpts(registration.opts), ...batch], registration.purpose, {
            cwd: opts.cwd,
            strict: registration.strict ?? false,
          }),
        )
      }
    }

    for (const dir of packageDirs) {
      out.push(bashOp(SOURCE, ["bun", "run", "test"], "test", { cwd: dir }))
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

  private match(path: string, disabled: Set<string>): Registration | null {
    for (const registration of this.registrations) {
      if (registration.enabled === false) continue
      if (matches(registration.matches, path)) return registration
    }
    return null
  }
}