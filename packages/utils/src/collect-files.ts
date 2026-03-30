// @paladin/utils/collect-files.ts

import { readdirSync } from "fs"
import { join, relative } from "path"

const DEFAULT_EXCLUDE = [/node_modules/, /\.git/, /dist/, /\.DS_Store/, /\.env/, /\.sqlite/, /\.db/, /drizzle\/meta/, /schema\.ts/]

export function collectFiles(dir: string, exclude: RegExp[] = []): string[] {
  exclude = [...DEFAULT_EXCLUDE, ...exclude]
  const entries = readdirSync(dir, { withFileTypes: true })
  const results: string[] = []

  for (const entry of entries) {
    const full = join(dir, entry.name)
    const rel = relative(dir, full)

    if (exclude.some((re) => re.test(rel))) continue

    if (entry.isDirectory()) {
      results.push(...collectFiles(full, exclude.map((re) => new RegExp(re.source, re.flags))))
    } else {
      results.push(full)
    }
  }

  return results
}
