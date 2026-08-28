import { extname } from "node:path"
import { collectImports, bash, classify, resolveRelativePath } from "@paladin/utils"
import type { BashResult } from "@paladin/utils"
import type { File } from "./types"

export const RUNNABLE_KINDS = ["test", "script", "story", "demo"] as const

export type RunnableKind = (typeof RUNNABLE_KINDS)[number]

const RUNNABLE = new Set<string>(RUNNABLE_KINDS)

export interface Matcher {
  kind?: RunnableKind
  ext?: string
}

export interface Registration {
  matches: Matcher
  command?: string
  handler?: (path: string) => BashResult | Promise<BashResult>
}

export interface RunOptions {
  skip?: string[]
  cwd?: string
}

export interface RunResult {
  path: string
  kind: RunnableKind
  ok: boolean
  bash?: BashResult
  error?: string
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

function importsOf(file: File): Set<string> {
  const paths = collectImports(file.content)
    .filter((ref) => ref.type === "local")
    .map((ref) => resolveRelativePath(ref.source, file.path))
    .filter((path): path is string => Boolean(path))
  return new Set(paths)
}

function toArgs(command: string, path: string): string[] {
  return command
    .split(" ")
    .filter(Boolean)
    .map((part) => (part === "<path>" ? path : part))
}

export const defaultRegistrations: Registration[] = [
  { id: 'test', matches: { kind: "test" }, command: "bun test <path>" },
  { matches: { kind: "script" }, command: "bun run <path>" },
  { matches: { kind: "demo" }, command: "bun run <path>" },
  { matches: { kind: "story", ext: "tsx" }, command: "bun run @paladin/utils <path>" },
]

export class CodeRunner {
  private registrations: Registration[] = []
  private imports = new Map<string, Set<string>>()

  constructor(registrations: Registration[] = defaultRegistrations) {
    for (const registration of registrations) this.register(registration)
  }

  register(registration: Registration): this {
    this.registrations.push(registration)
    return this
  }

  async run(files: File[], opts: RunOptions = {}): Promise<RunResult[]> {
    const targets = new Set<string>()

    for (const file of files) {
      if (runnableKind(file.path)) {
        if (file.status !== "unchanged") this.imports.set(file.path, importsOf(file))
        targets.add(file.path)
        continue
      }
      if (file.status === "unchanged") continue
      for (const runnable of this.importers(file.path)) targets.add(runnable)
    }

    const results: RunResult[] = []
    for (const path of targets) {
      if (isSkipped(path, opts.skip)) continue
      const kind = runnableKind(path)
      if (!kind) continue
      const registration = this.match(kind, extname(path).slice(1))
      if (!registration) continue
      results.push(await this.execute(registration, path, kind, opts))
    }
    return results
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

  private async execute(
    registration: Registration,
    path: string,
    kind: RunnableKind,
    opts: RunOptions,
  ): Promise<RunResult> {
    const { handler, command } = registration

    try {
      if (!handler && !command) {
        return { path, kind, ok: false, error: "registration has no handler or command" }
      }

      const result = handler
        ? await handler(path)
        : await bash(toArgs(command ?? "", path), { cwd: opts.cwd })

      return {
        kind: bash
        path,
        subkind,
      }
    }
  }
}


/*

no more handler field
