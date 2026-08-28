import { mkdir } from "node:fs/promises"
import { dirname, join, relative, resolve as resolvePath, sep } from "node:path"
import { resolveScopedPath } from "@paladin/utils"
import { parse } from "./parse"
import type { ClassDoc, FileDoc, FunctionDoc, SymbolDoc, TypeDoc } from "./parse.types"
import { collectEntryPoints, type EntryPoint, type EntryPointExclude } from "./entrypoints"
import { createLabeler, deriveRoot } from "./resolve-module"
import { resolveTypes, type ExternalRef, type TypeRequest } from "./resolve-types"
import { render } from "./docgen.render"

export type DocgenOptions = {
  /** Group files sharing a directory under one header. Defaults to true. */
  collate?: boolean
  /** Minimum files in a directory before collating it. Defaults to 3. */
  collateThreshold?: number
  /** Include non-public class members. Defaults to false. */
  includePrivate?: boolean
  /** Emit doc comments for type members. Defaults to true. */
  includeMemberDocs?: boolean
}

export type DocgenPackageOptions = DocgenOptions & {
  /** Files and symbols to drop while collecting entry points. */
  exclude?: EntryPointExclude
}

export type DocgenInput = EntryPoint | string

export type DocumentedSymbol = FunctionDoc | ClassDoc
export type TypeSection = { path: string, types: TypeDoc[] }
export type SymbolSection = { path: string, symbols: DocumentedSymbol[] }
export type DocgenResult = {
  /** Package name derived from the nearest package.json, when there is one. */
  package: string | null
  externals: ExternalRef[]
  types: TypeSection[]
  files: SymbolSection[]
  unresolved: TypeRequest[]
}

export type GeneratePackageIndexOptions = {
  /** Files and symbols to drop while collecting entry points. */
  exclude?: EntryPointExclude
}

export async function docgenPackage(
  spec: string,
  options: DocgenPackageOptions = {},
): Promise<string> {
  const { exclude, ...rest } = options
  const dir = await resolveScopedPath(spec)
  const entries = await collectEntryPoints(dir, { exclude })
  return docgen(entries, rest)
}

export async function docgen(
  input: DocgenInput[],
  options: DocgenOptions = {},
): Promise<string> {
  return render(await collect(input), options)
}

export async function collect(input: DocgenInput[]): Promise<DocgenResult> {
  const entries = input.map(toEntryPoint)
  const root = await deriveRoot(entries.map((entry) => entry.file))
  const label = createLabeler(root)
  const cache = new Map<string, Promise<FileDoc>>()
  const load = (path: string): Promise<FileDoc> => {
    let pending = cache.get(path)
    if (!pending) {
      pending = parse(path)
      cache.set(path, pending)
    }
    return pending
  }
  const seeds: TypeRequest[] = []
  const sections: SymbolSection[] = []
  const seen = new Set<string>()
  for (const entry of entries) {
    const path = entry.file
    if (seen.has(path)) continue
    seen.add(path)
    const doc = await load(path)
    const wanted = new Set(entry.symbols)
    const symbols = doc.symbols
      .filter(isDocumented)
      .filter((symbol) => wanted.size === 0 || wanted.has(symbol.name))
    if (symbols.length === 0) continue
    sections.push({ path: await label(path), symbols })
    for (const symbol of symbols) {
      for (const name of symbol.typeReferences) seeds.push({ name, from: path })
    }
  }
  const resolved = await resolveTypes(seeds, { load })
  const grouped = new Map<string, TypeDoc[]>()
  for (const type of resolved.types) {
    const path = await label(type.path)
    const bucket = grouped.get(path)
    if (bucket) bucket.push(type.doc)
    else grouped.set(path, [type.doc])
  }
  const types = [...grouped.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([path, docs]) => ({ path, types: docs.sort((a, b) => a.loc.line - b.loc.line) }))
  return {
    package: root.name,
    externals: resolved.externals,
    types,
    files: sections,
    unresolved: resolved.unresolved,
  }
}

export async function generatePackageIndex(
  spec: string,
  options: GeneratePackageIndexOptions = {},
): Promise<string> {
  const dir = await resolveScopedPath(spec)
  const entries = await collectEntryPoints(dir, { exclude: options.exclude })
  const indexPath = join(dir, "src/index.ts")
  const indexDir = dirname(indexPath)
  const seen = new Set<string>()
  const lines: string[] = []
  for (const entry of entries) {
    if (seen.has(entry.file)) continue
    seen.add(entry.file)
    const specifier = toImportSpecifier(indexDir, entry.file)
    lines.push(
      entry.symbols.length === 0
        ? `export * from "${specifier}"`
        : `export { ${entry.symbols.join(", ")} } from "${specifier}"`,
    )
  }
  lines.sort((a, b) => a.localeCompare(b))
  const content = lines.join("\n") + "\n"
  await mkdir(indexDir, { recursive: true })
  await Bun.write(indexPath, content)
  return indexPath
}

function toImportSpecifier(fromDir: string, file: string): string {
  const rel = relative(fromDir, file).replace(/\.tsx?$/, "")
  const posix = rel.split(sep).join("/")
  return posix.startsWith(".") ? posix : `./${posix}`
}

function toEntryPoint(input: DocgenInput): EntryPoint {
  if (typeof input === "string") return { file: resolvePath(input), symbols: [] }
  return { file: resolvePath(input.file), symbols: input.symbols }
}

function isDocumented(symbol: SymbolDoc): symbol is DocumentedSymbol {
  if (symbol.kind !== "function" && symbol.kind !== "class") return false
  return symbol.exportKind !== "none"
}
