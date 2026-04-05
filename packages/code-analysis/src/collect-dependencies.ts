// @paladin/code-analysis/collect-dependencies.ts

import { init, parse } from "es-module-lexer"
import { resolve, dirname } from "path"
import { readFileSync, existsSync } from "fs"

await init

/**
 * Collects all files reachable from an entry point via static imports,
 * confined to the given package root. Returns a flat list of absolute file paths.
 *
 * Skips bare specifiers (node_modules / cross-package imports) and only
 * follows relative or absolute import paths within the package boundary.
 */
export async function collectDependencies(entryFile: string, packageRoot: string): Promise<string[]> {
  const root = resolve(packageRoot)
  const visited = new Set<string>()
  const queue: string[] = [resolve(entryFile)]

  while (queue.length > 0) {
    const filePath = queue.pop()!

    if (visited.has(filePath)) continue
    visited.add(filePath)

    const source = readSource(filePath)
    if (!source) continue

    const [imports] = parse(source)

    for (const imp of imports) {
      const specifier = imp.n
      if (!specifier) continue

      if (!specifier.startsWith(".") && !specifier.startsWith("/")) continue

      const resolved = resolveImport(specifier, filePath)
      if (!resolved) continue

      if (!resolved.startsWith(root)) continue

      queue.push(resolved)
    }
  }

  return [...visited]
}

const EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".mts"]

function resolveImport(specifier: string, importer: string): string | undefined {
  const base = resolve(dirname(importer), specifier)

  if (existsSync(base) && hasExtension(base)) return base

  for (const ext of EXTENSIONS) {
    const candidate = base + ext
    if (existsSync(candidate)) return candidate
  }

  for (const ext of EXTENSIONS) {
    const candidate = resolve(base, `index${ext}`)
    if (existsSync(candidate)) return candidate
  }

  return undefined
}

function hasExtension(filePath: string): boolean {
  return EXTENSIONS.some((ext) => filePath.endsWith(ext))
}

function readSource(filePath: string): string | undefined {
  if (!existsSync(filePath)) return undefined
  return readFileSync(filePath, "utf-8")
}
