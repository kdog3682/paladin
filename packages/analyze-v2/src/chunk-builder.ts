// @paladin/packages/analyze-v2/chunk-builder.ts

import type { FileDoc, SymbolDoc, ImportRef } from "./parse-file.types"
import type { Chunk, ChunkKind } from "./chunk.types"
import { toShortForm, importsShortForm, statementShortForm } from "./short-form"

// ─── Sort Order ───

const KIND_ORDER: Record<ChunkKind, number> = {
  imports: 0,
  type: 1,
  const: 2,
  function: 3,
  class: 4,
  statement: 5,
}

function symbolToChunkKind(symbol: SymbolDoc): ChunkKind {
  switch (symbol.kind) {
    case "type":
    case "interface":
    case "enum":
      return "type"
    case "const":
    case "variable":
      return "const"
    case "function":
      return "function"
    case "class":
      return "class"
    default:
      return "statement"
  }
}

// ─── Long Form Extraction ───

function extractLongForm(source: string, lineRange: [number, number]): string {
  const lines = source.split("\n")
  return lines.slice(lineRange[0], lineRange[1]).join("\n")
}

function coalesceImports(imports: ImportRef[]): ImportRef[] {
  const map = new Map<string, string[]>()
  for (const imp of imports) {
    const existing = map.get(imp.source)
    if (existing) {
      existing.push(...imp.symbols)
    } else {
      map.set(imp.source, [...imp.symbols])
    }
  }
  return Array.from(map, ([source, symbols]) => ({ source, symbols }))
}

function formatImportsLong(imports: ImportRef[]): string {
  return imports
    .map(imp => {
      if (imp.symbols.length === 0) return `import "${imp.source}"`
      if (imp.symbols.length === 1) return `import { ${imp.symbols[0]} } from "${imp.source}"`
      return `import { ${imp.symbols.join(", ")} } from "${imp.source}"`
    })
    .join("\n")
}

// ─── Chunk Builders ───

function buildImportsChunk(imports: ImportRef[]): Chunk | null {
  if (imports.length === 0) return null
  const coalesced = coalesceImports(imports)
  return {
    id: "imports",
    kind: "imports",
    label: "Imports",
    shortForm: importsShortForm(coalesced),
    longForm: formatImportsLong(coalesced),
    lineRange: [0, 0],
  }
}

function buildSymbolChunk(
  symbol: SymbolDoc,
  source: string,
  index: number
): Chunk {
  const kind = symbolToChunkKind(symbol)
  return {
    id: `${kind}-${index}-${symbol.name}`,
    kind,
    label: symbol.name,
    shortForm: toShortForm(symbol),
    longForm: extractLongForm(source, symbol.lineRange),
    lineRange: symbol.lineRange,
  }
}

function buildStatementChunk(
  stmt: { source: string, lineRange: [number, number] },
  index: number
): Chunk {
  return {
    id: `statement-${index}`,
    kind: "statement",
    label: "statement",
    shortForm: statementShortForm(stmt),
    longForm: stmt.source,
    lineRange: stmt.lineRange,
  }
}

// ─── Public API ───

export function buildChunks(doc: FileDoc, source: string): Chunk[] {
  const chunks: Chunk[] = []

  const importsChunk = buildImportsChunk(doc.imports)
  if (importsChunk) chunks.push(importsChunk)

  const symbolCounts: Record<string, number> = {}
  for (const symbol of doc.symbols) {
    const kind = symbolToChunkKind(symbol)
    symbolCounts[kind] = (symbolCounts[kind] ?? 0) + 1
    chunks.push(buildSymbolChunk(symbol, source, symbolCounts[kind]))
  }

  doc.statements.forEach((stmt, i) => {
    chunks.push(buildStatementChunk(stmt, i))
  })

  chunks.sort((a, b) => {
    const kindDiff = KIND_ORDER[a.kind] - KIND_ORDER[b.kind]
    if (kindDiff !== 0) return kindDiff
    return a.lineRange[0] - b.lineRange[0]
  })

  return chunks
}
