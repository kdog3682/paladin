// @paladin/squire/src/commands/bash.ts
import type { Command } from "../handler"

export const bashCommand: Command = {
  name: "bash",
  description: "run a shell command from the package directory",
  requiresPkg: false,
  rawArgs: true,
  handler: async ({ raw }, ctx) => {
    const cmd = raw.trim()

    if (!cmd) {
      ctx.reporter.warn("usage: bash <command>")
      return
    }

    const cwd = ctx.state.pkgDir ?? ctx.root

    const proc = Bun.spawn({
      cmd: ["bash", "-c", cmd],
      cwd,
      stdout: "inherit",
      stderr: "inherit",
      stdin: "inherit",
      env: { ...process.env },
    })

    const code = await proc.exited

    if (code !== 0) {
      ctx.reporter.warn(`exited with code ${code}`)
    }
  },
}