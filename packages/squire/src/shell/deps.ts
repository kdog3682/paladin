// @paladin/squire/src/shell/deps.ts

import { init, parse } from "es-module-lexer"
import { readdir } from "fs/promises"
import { join } from "path"

export async function cacheDeps(pkgDir: string): Promise<string[]> {
  await init
  const allDeps: string[] = []

  async function walkAndParse(dir: string) {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        await walkAndParse(full)
        continue
      }
      if (!/\.(ts|tsx|js|jsx)$/.test(entry.name)) continue
      const source = await Bun.file(full).text()
      const [imports] = parse(source)
      for (const imp of imports) {
        const specifier = source.slice(imp.s, imp.e)
        if (specifier && !specifier.startsWith(".") && !allDeps.includes(specifier)) {
          allDeps.push(specifier)
        }
      }
    }
  }

  await walkAndParse(pkgDir)
  return allDeps
}
