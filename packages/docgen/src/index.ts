// @paladin/docgen/index.ts

import { resolve, dirname, join } from "path"
import { existsSync } from "fs"
import { discoverEntrypoints } from "./discover"
import { collectBarrelExports } from "./barrel"
import { parseFile, extractModuleDoc } from "./parser"
import { extractExports, collectAllExportedNames } from "./extractor"
import { formatDoc, buildImportStatement } from "./formatter"
import type { DocGenOptions, DocGenResult, ExportedSymbol, BarrelExport } from "./types"

export { type DocGenResult, type DocGenOptions, type ExportedSymbol } from "./types"

/**
 * Generate documentation for all entrypoints discovered
 * under the given root directory.
 *
 * By default, only documents symbols that the entrypoint barrel
 * explicitly exports. Pass `{ expandAll: true }` to document
 * everything in each source file.
 */
export function docgen(
  rootDir: string,
  options: DocGenOptions = {}
): { results: DocGenResult[], markdown: string } {
  const { expandAll = false } = options
  const entrypoints = discoverEntrypoints(rootDir)

  if (entrypoints.length === 0) {
    throw new Error(
      `No entrypoints found in ${rootDir}. Expected index.ts, main.ts, cli.ts, or server.ts in root, src/, or subdirectories.`
    )
  }

  const results: DocGenResult[] = []

  // track all documented symbol names globally to dedupe across entrypoints
  const documentedSymbols = new Set<string>()

  for (const entrypoint of entrypoints) {
    const entrypointDir = dirname(entrypoint)

    // extract module-level docstring from the entrypoint file
    const { source: entrypointSource } = parseFile(entrypoint)
    const moduleDescription = extractModuleDoc(entrypointSource)

    const barrelExports = collectBarrelExports(entrypoint)

    // group barrel exports by source file
    const bySource = groupBySource(barrelExports)

    const allExports: ExportedSymbol[] = []
    const allNames: string[] = []

    // 1) handle inline exports (source = null, defined in the entrypoint itself)
    const inlineNames = bySource.get(null)
    if (inlineNames) {
      const { ast, source } = parseFile(entrypoint)
      const allowed = expandAll ? null : new Set(inlineNames.map(e => e.localName))
      const symbols = extractExports(ast, source, allowed)

      for (const sym of symbols) {
        const mapping = inlineNames.find(e => e.localName === sym.name)
        if (mapping && mapping.exportedName !== sym.name) {
          sym.name = mapping.exportedName
        }
      }

      // dedupe against already-documented symbols from prior entrypoints
      for (const sym of symbols) {
        if (!documentedSymbols.has(sym.name)) {
          allExports.push(sym)
          allNames.push(sym.name)
          documentedSymbols.add(sym.name)
        }
      }
    }

    // 2) handle re-exports from other files
    for (const [sourcePath, exports] of bySource) {
      if (sourcePath === null) continue

      const resolvedPath = resolveSourcePath(entrypointDir, sourcePath)
      if (!resolvedPath) continue

      const { ast, source } = parseFile(resolvedPath)

      let allowedNames: Set<string> | null

      if (expandAll) {
        allowedNames = null
      } else {
        const starExport = exports.find(e => e.localName === "*")
        if (starExport) {
          const starNames = collectAllExportedNames(ast)
          allowedNames = new Set([
            ...exports.filter(e => e.localName !== "*").map(e => e.localName),
            ...starNames,
          ])
        } else {
          allowedNames = new Set(exports.map(e => e.localName))
        }
      }

      const symbols = extractExports(ast, source, allowedNames)

      for (const sym of symbols) {
        const mapping = exports.find(e => e.localName === sym.name)
        if (mapping && mapping.exportedName !== sym.name && mapping.exportedName !== "*") {
          sym.name = mapping.exportedName
        }
      }

      // dedupe
      for (const sym of symbols) {
        if (!documentedSymbols.has(sym.name)) {
          allExports.push(sym)
          allNames.push(sym.name)
          documentedSymbols.add(sym.name)
        }
      }
    }

    // skip this entrypoint entirely if all its symbols were already documented
    if (allExports.length === 0 && !moduleDescription) continue

    const modulePath = deriveModulePath(entrypoint)
    const exportNames = allNames.filter(n => n !== "default")
    const importStatement = buildImportStatement(exportNames, modulePath)

    results.push({
      entrypoint,
      absolutePath: entrypoint,
      description: moduleDescription,
      exports: allExports,
      importStatement,
    })
  }

  const markdown = results.map(r => formatDoc(r)).join("\n---\n\n")
  return { results, markdown }
}

function groupBySource(exports: BarrelExport[]): Map<string | null, BarrelExport[]> {
  const map = new Map<string | null, BarrelExport[]>()
  for (const exp of exports) {
    const key = exp.source
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(exp)
  }
  return map
}

function resolveSourcePath(fromDir: string, importPath: string): string | null {
  const extensions = [".ts", ".tsx", "/index.ts", "/index.tsx"]

  const direct = resolve(fromDir, importPath)
  if (existsSync(direct)) return direct

  for (const ext of extensions) {
    const candidate = resolve(fromDir, importPath + ext)
    if (existsSync(candidate)) return candidate
  }

  return null
}

function deriveModulePath(filePath: string): string {
  const parts = filePath.replace(/\\/g, "/").split("/")

  const stripped: string[] = []
  for (const part of parts) {
    if (["index.ts", "index.tsx", "main.ts", "main.tsx", "cli.ts", "cli.tsx", "server.ts", "server.tsx"].includes(part)) continue
    if (part === "src" && stripped.length > 0) continue
    stripped.push(part)
  }

  const last = stripped[stripped.length - 1] ?? ""
  const secondLast = stripped[stripped.length - 2] ?? ""

  if (secondLast === "packages" || secondLast.startsWith("@")) {
    const scope = stripped[stripped.length - 3]
    if (scope?.startsWith("@")) return `${scope}/${last}`
    return last
  }

  return last || filePath
}
