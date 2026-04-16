// src/services/runcode/CodeRunner.ts

import { getHandler } from "./utils/get-handler"
import { findPair } from "./utils/find-pair"
import { handlers as defaultHandlers } from "./handlers"
import type { FileEntry } from "../../types/claude"
import type { HandlerDef, RunFile, RunResult } from "./types"

export class CodeRunner {
  private handlers: HandlerDef[]
  private autoRunOverrides = new Map<string, boolean>()

  constructor(handlers: HandlerDef[] = defaultHandlers) {
    this.handlers = handlers
  }

  // ── Auto-run state ──────────────────────────────────────

  setAutoRun(file: string, enabled: boolean): void {
    this.autoRunOverrides.set(file, enabled)
  }

  getAutoRun(file: string): boolean | null {
    const override = this.autoRunOverrides.get(file)
    if (override !== undefined) return override
    const handler = getHandler(file, this.handlers)
    return handler?.autoRun ?? null
  }

  private shouldAutoRun(file: string, handler: HandlerDef): boolean {
    const override = this.autoRunOverrides.get(file)
    if (override !== undefined) return override
    return handler.autoRun
  }

  // ── Collect ─────────────────────────────────────────────

  /**
   * Collect files that need to run based on changed files.
   * Handles matching, pairing, and dedup.
   */
  collect(files: FileEntry[]): RunFile[] {
    const paths = files.map((f) => f.path)
    const seen = new Map<string, string>()

    for (const p of paths) {
      const direct = getHandler(p, this.handlers)

      if (direct) {
        if (this.shouldAutoRun(p, direct) && !seen.has(p)) {
          seen.set(p, direct.name)
        }
        continue
      }

      for (const handler of this.handlers) {
        if (!handler.pairs) continue
        if (!this.shouldAutoRun(p, handler)) continue

        const paired = findPair(p, handler.suffix)
        if (paired && !seen.has(paired)) {
          seen.set(paired, handler.name)
        }
      }
    }

    return Array.from(seen, ([file, handler]) => ({ handler, file }))
  }

  // ── Run ─────────────────────────────────────────────────

  async run(runList: RunFile[]): Promise<RunResult[]> {
    const results: RunResult[] = []

    for (const { handler: handlerName, file } of runList) {
      const handler = this.handlers.find((h) => h.name === handlerName)
      if (!handler) continue

      const data = await handler.run(file)
      const success = "exitCode" in data ? data.exitCode === 0 : true

      results.push({ name: handlerName, file, success, data })
    }

    return results
  }

  /**
   * Convenience: rerun a single file by path. Uses the handler matching
   * the file's suffix directly (no pairing).
   */
  async rerun(file: string): Promise<RunResult | null> {
    const handler = getHandler(file, this.handlers)
    if (!handler) return null

    const data = await handler.run(file)
    const success = "exitCode" in data ? data.exitCode === 0 : true

    return { name: handler.name, file, success, data }
  }
}
