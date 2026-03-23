// @paladin/utils/get-paths.ts

import { readdirSync, statSync } from "fs"
import { join, relative } from "path"

const DEFAULT_EXCLUDE = [
  /node_modules/,
  /\.next/,
  /dist/,
  /\.turbo/,
  /\.env/,
  /\.git$/,
  /\.gitignore/,
  /(__pycache__|\.pyc$|\.pyo$|\.egg-info)/,
  /\.(venv|mypy_cache|pytest_cache|ruff_cache|DS_Store)/,
  /\.lock(b)?$/,
  /__snapshots__/,
  /\.sqlite3?$/,
  /\.db$/,
]

export interface GetPathsOptions {
  exclude?: (RegExp | string)[]
  include?: (RegExp | string)[]
  mode?: "file" | "dir"
}

function toRegExp(pattern: RegExp | string): RegExp {
  return typeof pattern === "string" ? new RegExp(pattern) : pattern
}

export function getPaths(
  dir: string,
  options: GetPathsOptions = {}
): string[] {
  const { mode = "file" } = options

  const excludePatterns = [
    ...DEFAULT_EXCLUDE,
    ...(options.exclude ?? []).map(toRegExp),
  ]
  const includePatterns = (options.include ?? []).map(toRegExp)

  const results: string[] = []

  function walk(current: string) {
    const entries = readdirSync(current, { withFileTypes: true })

    for (const entry of entries) {
      const full = join(current, entry.name)
      const rel = relative(dir, full)

      if (excludePatterns.some(p => p.test(rel))) continue

      if (entry.isDirectory()) {
        if (mode === "dir") results.push(full)
        walk(full)
        continue
      }

      if (mode === "file") {
        if (includePatterns.length && !includePatterns.some(p => p.test(rel))) continue
        results.push(full)
      }
    }
  }

  walk(dir)
  return results
}
