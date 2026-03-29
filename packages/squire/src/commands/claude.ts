// @paladin/squire/src/commands/claude.ts

import type { Command } from "../handler"

const MODELS: Record<string, string> = {
  sonnet: "claude-sonnet-4-5",
  opus: "claude-opus-4-6",
  haiku: "claude-haiku-4-5",
}

const DEFAULT_MODEL = "sonnet"
let currentModel = DEFAULT_MODEL

export const claudeCommand: Command = {
  name: "claude",
  description: "run claude -p with package context. 'claude model sonnet/opus/haiku' to switch",
  requiresPkg: true,
  handler: async ({ raw, tokens }, ctx) => {
    if (!raw) {
      ctx.reporter.info(`model: ${currentModel} (${MODELS[currentModel]})`)
      ctx.reporter.warn("usage: claude <prompt> | claude model <sonnet|opus|haiku>")
      return
    }

    if (tokens[0] === "model") {
      const key = tokens[1]?.toLowerCase()
      if (!key || !MODELS[key]) {
        ctx.reporter.error(`unknown model: ${key ?? "(none)"}. options: ${Object.keys(MODELS).join(", ")}`)
        return
      }
      currentModel = key
      ctx.reporter.success(`model set to: ${key}`)
      return
    }

    const cwd = ctx.state.pkgDir!
    const modelFlag = MODELS[currentModel]
    ctx.reporter.info(`claude (${currentModel}) — ${cwd}`)

    const proc = Bun.spawn(["claude", "-p", "--model", modelFlag, raw], {
      cwd,
      stdout: "inherit",
      stderr: "inherit",
      stdin: "inherit",
    })
    await proc.exited
  },
}
