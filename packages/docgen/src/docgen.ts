import { resolve as resolvePath } from "node:path"
import { parse } from "./parse"
import type { ClassDoc, FileDoc, FunctionDoc, SymbolDoc, TypeDoc } from "./parse.types"
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

export async function docgen(files: string[], options: DocgenOptions = {}): Promise<string> {
  return render(await collect(files), options)
}

export async function collect(files: string[]): Promise<DocgenResult> {
  const root = await deriveRoot(files)
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
  for (const file of files) {
    const path = resolvePath(file)
    if (seen.has(path)) continue
    seen.add(path)
    const doc = await load(path)
    const symbols = doc.symbols.filter(isDocumented)
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

function isDocumented(symbol: SymbolDoc): symbol is DocumentedSymbol {
  if (symbol.kind !== "function" && symbol.kind !== "class") return false
  return symbol.exportKind !== "none"
}
