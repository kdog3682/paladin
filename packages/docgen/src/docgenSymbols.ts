import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { collectExports, resolveScopedPath } from "@paladin/utils"
import { docgen, type DocgenOptions } from "./docgen"
import type { EntryPoint } from "./entrypoints"

export type IndexedSymbol = {
  /** Name the symbol is exported under from the package barrel. */
  name: string
  /** Name of the declaration inside `file`. */
  local: string
  /** Absolute path of the file that declares the symbol. */
  file: string
  /** Package the symbol is exported from (package.json name, else dir name). */
  package: string
}

/** Exported name -> every package location exporting it. */
export type SymbolIndex = Map<string, IndexedSymbol[]>

export type ScopeSpec = {
  /** Scope part of the spec, e.g. `@mathpen`. */
  scope: string
  /** Package within the scope, e.g. `manim`. Undefined means every package. */
  pkg?: string
}

export type TextSymbols = {
  /** Specs mentioned in the text that resolved, redundant ones collapsed. */
  specs: string[]
  /** Symbol names found in the text, in order of first appearance. */
  symbols: string[]
}

const WORD = /[A-Za-z_$][\w$]*/g

/** `@scope` or `@scope/pkg` not preceded by a word char, `@`, `/` or `.` (skips emails, paths). */
const SPEC = /(?<![\w@/.])@[A-Za-z0-9][\w-]*(?:\/[A-Za-z0-9][\w.-]*)?/g

const indexCache = new Map<string, SymbolIndex>()

/** Split `@scope` / `@scope/pkg` into its parts. */
export function parseSpec(spec: string): ScopeSpec {
  const m = /^(@[^/\s]+)(?:\/([^/\s]+))?$/.exec(spec.trim())
  if (!m) throw new Error(`invalid scope spec: ${spec}`)
  return { scope: m[1]!, pkg: m[2] }
}

/**
 * Index packages under `<scope>/packages/<name>` using their src/index.ts
 * barrels. `@scope` indexes every package, `@scope/pkg` only that one.
 * Cached per spec.
 */
export function indexScope(spec: string): SymbolIndex {
  let index = indexCache.get(spec)
  if (!index) {
    const { scope, pkg } = parseSpec(spec)
    index = indexPackages(join(resolveScopedPath(scope), "packages"), pkg)
    indexCache.set(spec, index)
  }
  return index
}

/** Merge the indexes of several specs, deduping hits. */
export function indexSpecs(specs: string | string[]): SymbolIndex {
  const list = normalizeSpecs(Array.isArray(specs) ? specs : [specs])
  if (list.length === 1) return indexScope(list[0]!)
  const merged: SymbolIndex = new Map()
  const seen = new Set<string>()
  for (const spec of list) {
    for (const [name, hits] of indexScope(spec)) {
      for (const hit of hits) {
        const key = `${name}\0${hit.file}\0${hit.local}`
        if (seen.has(key)) continue
        seen.add(key)
        const bucket = merged.get(name)
        if (bucket) bucket.push(hit)
        else merged.set(name, [hit])
      }
    }
  }
  return merged
}

/** Dedupe specs and drop `@a/b` when `@a` is also present. */
export function normalizeSpecs(specs: string[]): string[] {
  const unique = [...new Set(specs.map(s => s.trim()))]
  const whole = new Set(unique.filter(s => !parseSpec(s).pkg))
  return unique.filter(s => {
    const { scope, pkg } = parseSpec(s)
    return !pkg || !whole.has(scope)
  })
}

/** Every `@scope` / `@scope/pkg` mention in `text`, in order of first appearance. */
export function specsInText(text: string): string[] {
  return [...new Set(text.match(SPEC) ?? [])]
}

/**
 * Find the specs mentioned in `text` (unresolvable ones are ignored), then
 * every word naming a symbol exported by those packages.
 */
export function fromText(text: string): TextSymbols {
  const specs = normalizeSpecs(specsInText(text).filter(isResolvable))
  if (specs.length === 0) return { specs, symbols: [] }
  const words = text.replace(SPEC, " ")
  return { specs, symbols: symbolsInText(words, indexSpecs(specs)) }
}

/** Unique words in `text` that are keys of `index`, in order of first appearance. */
export function symbolsInText(text: string, index: SymbolIndex): string[] {
  const found = new Set<string>()
  for (const word of text.match(WORD) ?? []) {
    if (index.has(word)) found.add(word)
  }
  return [...found]
}

/**
 * Generate docs for the named symbols of one or more specs. Unknown names are
 * skipped. When `symbols` is omitted, every symbol in the index is documented.
 */
export async function docgenSymbols(
  spec: string | string[],
  symbols?: string[],
  options: DocgenOptions = {},
): Promise<string> {
  const index = indexSpecs(spec)
  const groups = entryPointsByPackage(symbols ?? [...index.keys()], index)
  const docs: string[] = []
  for (const entries of groups.values()) {
    const doc = await docgen(entries, options)
    if (doc) docs.push(doc)
  }
  return docs.join("\n")
}

/** Generate docs for every symbol mentioned in `text` from the specs it mentions. */
export async function docgenText(text: string, options: DocgenOptions = {}): Promise<string> {
  const { specs, symbols } = fromText(text)
  if (specs.length === 0) return ""
  return docgenSymbols(specs, symbols, options)
}

/** Map symbol names to docgen entry points. Omitted `symbols` means all. */
export function toEntryPoints(spec: string | string[], symbols?: string[]): EntryPoint[] {
  const index = indexSpecs(spec)
  return entryPointsFor(symbols ?? [...index.keys()], index)
}

/** Map symbol names to entry points, grouped by declaring file. */
export function entryPointsFor(symbols: string[], index: SymbolIndex): EntryPoint[] {
  const byFile = new Map<string, Set<string>>()
  for (const name of symbols) {
    for (const hit of index.get(name) ?? []) {
      const bucket = byFile.get(hit.file)
      if (bucket) bucket.add(hit.local)
      else byFile.set(hit.file, new Set([hit.local]))
    }
  }
  return [...byFile.entries()].map(([file, names]) => ({ file, symbols: [...names] }))
}

/**
 * Map symbol names to entry points, grouped by declaring package and then
 * file. Kept separate per package so `docgen` never attributes a symbol to
 * the wrong package's barrel when a spec spans several packages.
 */
export function entryPointsByPackage(symbols: string[], index: SymbolIndex): Map<string, EntryPoint[]> {
  const byPackage = new Map<string, Map<string, Set<string>>>()
  for (const name of symbols) {
    for (const hit of index.get(name) ?? []) {
      let byFile = byPackage.get(hit.package)
      if (!byFile) {
        byFile = new Map()
        byPackage.set(hit.package, byFile)
      }
      const bucket = byFile.get(hit.file)
      if (bucket) bucket.add(hit.local)
      else byFile.set(hit.file, new Set([hit.local]))
    }
  }
  const result = new Map<string, EntryPoint[]>()
  for (const [pkg, byFile] of byPackage) {
    result.set(pkg, [...byFile.entries()].map(([file, names]) => ({ file, symbols: [...names] })))
  }
  return result
}

/**
 * Build a symbol index from `<packagesDir>/<name>/src/index.ts` barrels.
 * When `only` is given, index just the package whose dir name or
 * package.json name (bare or scoped) matches it.
 */
export function indexPackages(packagesDir: string, only?: string): SymbolIndex {
  const dirents = readdirSync(packagesDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name))
  const index: SymbolIndex = new Map()
  for (const dirent of dirents) {
    const pkgDir = join(packagesDir, dirent.name)
    const entry = join(pkgDir, "src/index.ts")
    if (!existsSync(entry)) continue
    const pkg = readPackageName(pkgDir, dirent.name)
    if (only && !matchesPackage(only, dirent.name, pkg)) continue
    for (const [name, target] of collectExports(entry)) {
      const hit: IndexedSymbol = { name, local: target.local, file: target.file, package: pkg }
      const bucket = index.get(name)
      if (bucket) bucket.push(hit)
      else index.set(name, [hit])
    }
  }
  return index
}

function matchesPackage(only: string, dirName: string, pkgName: string): boolean {
  return only === dirName || only === pkgName || pkgName.endsWith(`/${only}`)
}

function isResolvable(spec: string): boolean {
  try {
    const { scope } = parseSpec(spec)
    const root = resolveScopedPath(scope)
    return !!root && existsSync(join(root, "packages"))
  } catch {
    return false
  }
}

function readPackageName(dir: string, fallback: string): string {
  try {
    const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"))
    return typeof pkg.name === "string" ? pkg.name : fallback
  } catch {
    return fallback
  }
}
