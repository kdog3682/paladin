import type { FileDoc, SymbolDoc } from "./parse.types"

export type ExcludePreset = "demo" | "script" | "test"

export type DocgenOptions = {
  /** Base for displayed paths. Defaults to the common ancestor of every documented file. */
  root?: string
  /** Presets handed to `collectFiles` when an input is a directory. */
  exclude?: ExcludePreset[]
  /** Extensions tried when resolving relative specifiers. */
  extensions?: string[]
  /** Follow type references out of the types they pull in, not just params/returns. */
  transitive?: boolean
  /** Hop limit for type-reference expansion. */
  maxDepth?: number
  /** Restrict the documented exports to these kinds. Referenced types are still pulled in. */
  kinds?: SymbolDoc["kind"][]
  /** Render `private`/`protected` class members. */
  includeNonPublic?: boolean
  /** Wrap each file section in a ```ts fence. */
  fence?: boolean
}

/** A symbol as seen through a module's public surface. */
export type ExportedSymbol = {
  /** File that declares it, never the file that re-exports it. */
  file: string
  symbol: SymbolDoc
  /** Name the module exposes it under. */
  exposedAs: string
}

export type Decl = {
  file: string
  symbol: SymbolDoc
}

/** Parse cache plus the export graph derived from it. */
export type Store = {
  docs: Map<string, FileDoc>
  exportCache: Map<string, Map<string, ExportedSymbol>>
  visiting: Set<string>
  /** Specifiers that could not be resolved to a local file. */
  unresolved: Set<string>
  /** Files that threw during parse, keyed by path. */
  failed: Map<string, string>
  extensions: string[]
}

export type DocEntry = {
  file: string
  symbol: SymbolDoc
  exposedAs: string
  /** Additional names the symbol is exported under elsewhere. */
  aliases: string[]
  /** Files holding a byte-identical declaration that was folded into this one. */
  duplicates: string[]
  /** How many other documented symbols mention this one in a type position. */
  references: number
  reason: "export" | "type-ref"
}

export type DocgenResult = {
  /** Rendered document: tree followed by one section per file. */
  text: string
  tree: string
  entries: DocEntry[]
  /** Display paths, in output order. */
  files: string[]
  unresolved: string[]
  failed: Array<[string, string]>
}
