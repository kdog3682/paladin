// @paladin/squire/src/commands/ls.ts
import type { Command } from "../handler"

export const lsCommand: Command = {
  name: "ls",
  description: "list files in the current package directory",
  requiresPkg: true,
  handler: async ({ raw }, ctx) => {
    const pkgDir = ctx.state.pkgDir!
    const pattern = raw.trim() || "**/*"

    const glob = new Bun.Glob(pattern)
    const files: string[] = []

    for await (const match of glob.scan({ cwd: pkgDir, onlyFiles: true })) {
      files.push(match)
    }

    if (files.length === 0) {
      ctx.reporter.warn("no files found")
      return
    }

    files.sort()
    ctx.reporter.blank()
    ctx.reporter.header(pkgDir)
    ctx.reporter.grid(files)
    ctx.reporter.blank()
  },
}