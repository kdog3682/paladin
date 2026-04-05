// @paladin/packages/api/src/services/filewatch/runnable.ts

import { readFile } from "fs/promises"
import { basename } from "path"
import { init, parse } from "es-module-lexer"
import { bash } from "../../utils/bash"
import type { BashResult } from "../../utils/bash"

await init

// ── Types ───────────────────────────────────────────────────

interface Handler {
  name: string
  match: (file: string) => boolean
  run: (file: string) => Promise<BashResult | Record<string, unknown>>
}

export interface RunResult {
  name: string
  file: string
  data: BashResult | Record<string, unknown>
  startedAt: string
  finishedAt: string
  durationMs: number
}

// ── Handlers ────────────────────────────────────────────────

const handlers: Handler[] = [
  {
    name: "test",
    match: (f) => /\.(test|spec|e2e)\./.test(basename(f)),
    run: (file) => bash(["bun", "test", file]),
  },
  {
    name: "demo",
    match: (f) => /\.demo\./.test(basename(f)),
    run: (file) => bash(["bun", "run", file]),
  },
]

// ── Import tracking ─────────────────────────────────────────

const importCache = new Map<string, Set<string>>()

async function getImports(filePath: string): Promise<Set<string>> {
  if (importCache.has(filePath)) return importCache.get(filePath)!

  try {
    const content = await readFile(filePath, "utf-8")
    const [imports] = parse(content)
    const deps = new Set<string>()
    for (const imp of imports) {
      if (imp.n && imp.n.startsWith(".")) {
        deps.add(imp.n)
      }
    }
    importCache.set(filePath, deps)
    return deps
  } catch {
    return new Set()
  }
}

function findAffectedFiles(
  changedFiles: string[],
  handlerFiles: string[],
): string[] {
  const affected: string[] = []

  for (const hf of handlerFiles) {
    const imports = importCache.get(hf)
    if (!imports) continue

    for (const imp of imports) {
      if (changedFiles.some((cf) => cf.includes(imp.replace(/^\.\//, "")))) {
        affected.push(hf)
        break
      }
    }
  }

  return affected
}

// ── Runner ──────────────────────────────────────────────────

export class Runner {
  private pending: { handler: Handler, file: string }[] = []

  async match(paths: string[]): Promise<string[]> {
    for (const p of paths) {
      await getImports(p)
    }

    for (const handler of handlers) {
      const matched = paths.filter(handler.match)
      if (!matched.length) continue

      const affected = findAffectedFiles(paths, matched)
      const all = [...new Set([...matched, ...affected])]

      for (const file of all) {
        this.pending.push({ handler, file })
      }
    }

    return this.pending.map((p) => p.handler.name)
  }

  get hasPending(): boolean {
    return this.pending.length > 0
  }

  async run(): Promise<RunResult[]> {
    const results: RunResult[] = []

    for (const { handler, file } of this.pending) {
      const startedAt = new Date().toISOString()
      const start = performance.now()

      const data = await handler.run(file)

      const finishedAt = new Date().toISOString()
      const durationMs = Math.round(performance.now() - start)

      results.push({
        name: handler.name,
        file,
        data,
        startedAt,
        finishedAt,
        durationMs,
      })
    }

    return results
  }
}
