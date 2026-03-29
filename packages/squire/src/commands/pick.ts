// @paladin/squire/src/commands/pick.ts
import { join, basename } from "path"
import { tempwrite } from "@paladin/utils/tempwrite"
import type { Command } from "../handler"

const LETTERS = "abcdefghijklmnopqrstuvwxyz"

function parseSelections(input: string, count: number): number[] {
  if (count <= 26) {
    return [...new Set(input.split(""))]
      .map(ch => LETTERS.indexOf(ch))
      .filter(i => i >= 0 && i < count)
      .sort((a, b) => a - b)
  }

  const indices = new Set<number>()

  for (const token of input.split(/[\s,]+/).filter(Boolean)) {
    const range = token.match(/^(\d+)-(\d+)$/)
    if (range) {
      const lo = parseInt(range[1], 10)
      const hi = parseInt(range[2], 10)
      for (let i = lo; i <= hi; i++) {
        if (i >= 1 && i <= count) indices.add(i - 1)
      }
    } else {
      const n = parseInt(token, 10)
      if (!isNaN(n) && n >= 1 && n <= count) indices.add(n - 1)
    }
  }

  return [...indices].sort((a, b) => a - b)
}

export const pickCommand: Command = {
  name: "pick",
  description: "pick files by letter or number. 'pick' to list, 'pick ace' or 'pick 1 3 5' to open",
  requiresPkg: true,
  handler: async ({ raw }, ctx) => {
    const pkgDir = ctx.state.pkgDir!
    const glob = new Bun.Glob("**/*.{ts,tsx}")
    const files: string[] = []

    for await (const match of glob.scan({ cwd: pkgDir, onlyFiles: true })) {
      files.push(match)
    }

    if (files.length === 0) {
      ctx.reporter.warn("no ts/tsx files found")
      return
    }

    files.sort()
    const names = files.map(f => basename(f))
    ctx.reporter.blank()
    ctx.reporter.grid(names)
    ctx.reporter.blank()

    const input = raw.trim().toLowerCase()
    if (!input) return

    const indices = parseSelections(input, files.length)

    if (indices.length === 0) {
      ctx.reporter.warn("no valid selections")
      return
    }

    const parts: string[] = []
    for (const i of indices) {
      const content = await Bun.file(join(pkgDir, files[i])).text()
      parts.push(content)
    }

    await tempwrite(parts.join("\n----\n"))
    ctx.reporter.success(`opened ${indices.length} file(s)`)
  },
}