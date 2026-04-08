// src/services/codeRunner.ts

import { existsSync } from "node:fs"
import { basename, dirname, join, extname } from "node:path"
import { bash } from "../utils/bash"
import type { BashResult } from "../utils/bash"
import type { FileEntry } from "../types/claude"

// ── Types ───────────────────────────────────────────────────

interface HandlerDef {
  name: string
  suffix: string
  run: (file: string) => Promise<BashResult | Record<string, unknown>>
  /** if true, a source file change will also trigger its paired handler file */
  pairs: boolean
  /** whether this handler auto-runs when files update */
  autoRun: boolean
}

export interface RunFile {
  handler: string
  file: string
}

export interface RunResult {
  name: string
  file: string
  success: boolean
  data: BashResult | Record<string, unknown>
  startedAt: string
  finishedAt: string
  durationMs: number
}

// ── Handler definitions ─────────────────────────────────────

const handlers: HandlerDef[] = [
  {
    name: "test",
    suffix: ".test.",
    run: (file) => bash(["bun", "test", file]),
    pairs: true,
    autoRun: true,
  },
  {
    name: "demo",
    suffix: ".demo.",
    run: (file) => bash(["bun", "run", file]),
    pairs: true,
    autoRun: false,
  },
  {
    name: "mochi",
    suffix: ".mochi.",
    run: async (file) => {
      console.log(`[mochi] ${file}`)
      return { status: "logged", file }
    },
    pairs: false,
    autoRun: false,
  },
  {
    name: "stories",
    suffix: ".stories.",
    run: async (file) => {
      console.log(`[stories] ${file}`)
      return { status: "logged", file }
    },
    pairs: false,
    autoRun: false,
  },
]

// ── Utilities ───────────────────────────────────────────────

function getHandler(file: string): HandlerDef | null {
  const base = basename(file)
  return handlers.find((h) => base.includes(h.suffix)) ?? null
}

function findPair(file: string, suffix: string): string | null {
  const base = basename(file)
  const dir = dirname(file)

  if (base.includes(suffix)) {
    const sourceName = base.replace(suffix, ".")
    const candidate = join(dir, sourceName)
    return existsSync(candidate) ? candidate : null
  }

  const ext = extname(file)
  const stem = base.slice(0, -ext.length)
  const handlerName = `${stem}${suffix}${ext.slice(1)}`
  const candidate = join(dir, handlerName)
  return existsSync(candidate) ? candidate : null
}

// ── Auto-run registry ───────────────────────────────────────

const autoRunOverrides = new Map<string, boolean>()

function shouldAutoRun(file: string, handler: HandlerDef): boolean {
  const override = autoRunOverrides.get(file)
  if (override !== undefined) return override
  return handler.autoRun
}

export function setAutoRun(file: string, enabled: boolean): void {
  autoRunOverrides.set(file, enabled)
}

// ── Collect ─────────────────────────────────────────────────

/**
 * Collect files that need to run based on changed files.
 * Handles matching, pairing, dedup. No side effects.
 */
export function collectRunFiles(files: FileEntry[]): RunFile[] {
  const paths = files.map((f) => f.path)
  const seen = new Map<string, string>()

  for (const p of paths) {
    const direct = getHandler(p)

    if (direct) {
      if (shouldAutoRun(p, direct) && !seen.has(p)) {
        seen.set(p, direct.name)
      }
      continue
    }

    for (const handler of handlers) {
      if (!handler.pairs) continue
      if (!shouldAutoRun(p, handler)) continue

      const paired = findPair(p, handler.suffix)
      if (paired && !seen.has(paired)) {
        seen.set(paired, handler.name)
      }
    }
  }

  return Array.from(seen, ([file, handler]) => ({ handler, file }))
}

// ── Run ─────────────────────────────────────────────────────

/**
 * Run a list of collected files.
 */
export async function runFiles(runList: RunFile[]): Promise<RunResult[]> {
  const results: RunResult[] = []

  for (const { handler: handlerName, file } of runList) {
    const handler = handlers.find((h) => h.name === handlerName)
    if (!handler) continue

    const startedAt = new Date().toISOString()
    const start = performance.now()

    const data = await handler.run(file)

    const finishedAt = new Date().toISOString()
    const durationMs = Math.round(performance.now() - start)

    const success = "exitCode" in data ? data.exitCode === 0 : true

    results.push({ name: handlerName, file, success, data, startedAt, finishedAt, durationMs })
  }

  return results
}

/**
 * Run a single file with its matched handler.
 */
export async function runSingle(file: string): Promise<RunResult | null> {
  const handler = getHandler(file)
  if (!handler) return null

  const startedAt = new Date().toISOString()
  const start = performance.now()

  const data = await handler.run(file)

  const finishedAt = new Date().toISOString()
  const durationMs = Math.round(performance.now() - start)
  const success = "exitCode" in data ? data.exitCode === 0 : true

  return { name: handler.name, file, success, data, startedAt, finishedAt, durationMs }
}
