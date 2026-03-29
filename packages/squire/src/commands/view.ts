// @paladin/squire/src/commands/view.ts

import { join, basename } from "path"
import { tempwrite } from "@paladin/utils/tempwrite"
import type { Command } from "../handler"

function parseFilters(tokens: string[]) {
  const includes: string[] = []
  const excludes: string[] = []

  let mode: "include" | "exclude" | null = null
  for (const token of tokens) {
    const lower = token.toLowerCase()
    if (lower === "include") {
      mode = "include"
    } else if (lower === "exclude") {
      mode = "exclude"
    } else if (mode === "include") {
      includes.push(lower)
    } else if (mode === "exclude") {
      excludes.push(lower)
    } else {
      includes.push(lower)
    }
  }

  return { includes, excludes }
}

function fuzzyMatch(needle: string, haystack: string): boolean {
  let hi = 0
  for (let ni = 0; ni < needle.length; ni++) {
    const ch = needle[ni]
    while (hi < haystack.length && haystack[hi] !== ch) hi++
    if (hi >= haystack.length) return false
    hi++
  }
  return true
}

function matchesFilter(filePath: string, patterns: string[]): boolean {
  const lower = filePath.toLowerCase()
  const base = basename(lower)
  const name = base.replace(/\.\w+$/, "")
  return patterns.some(p => {
    if (p.includes("*") || p.includes("?")) {
      const pattern = p.endsWith("/") ? `**/${p}**` : `**/${p}`
      const glob = new Bun.Glob(pattern)
      return glob.match(lower)
    }
    if (p.includes("/")) {
      const dir = p.endsWith("/") ? p : `${p}/`
      return lower.includes(dir)
    }
    return base.includes(p) || fuzzyMatch(p, name)
  })
}

export const viewCommand: Command = {
  name: "view",
  description: "join all ts/tsx files and open. view [include <pat>...] [exclude <pat>...]",
  requiresPkg: true,
  handler: async ({ tokens }, ctx) => {
    const pkgDir = ctx.state.pkgDir!
    const glob = new Bun.Glob("**/*.{ts,tsx}")
    let files: string[] = []

    for await (const match of glob.scan({ cwd: pkgDir, onlyFiles: true })) {
      files.push(match)
    }

    if (files.length === 0) {
      ctx.reporter.warn("no ts/tsx files found")
      return
    }

    if (tokens.length > 0) {
      const { includes, excludes } = parseFilters(tokens)

      if (excludes.length > 0) {
        files = files.filter(f => !matchesFilter(f, excludes))
      }

      if (includes.length > 0) {
        files = files.filter(f => matchesFilter(f, includes))
      }
    }

    if (files.length === 0) {
      ctx.reporter.warn("no files matched after filtering")
      return
    }

    files.sort()

    const parts: string[] = []
    for (const file of files) {
      const content = await Bun.file(join(pkgDir, file)).text()
      parts.push(content)
    }

    const joined = parts.join("\n----\n")
    await tempwrite(joined)
    ctx.reporter.success(`opened ${files.length} files`)
  },
}
