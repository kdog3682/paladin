// @paladin/packages/analyze-v2/index.ts

export type { FileDoc, SymbolDoc, Param, ImportRef } from "./parse-file.types"
export type { Chunk, ChunkKind, ShortForm } from "./chunk.types"
export type { FileAnalysis } from "./analysis.types"

import type { FileAnalysis } from "./analysis.types"
import { parseFile } from "./parse-file"
import { buildChunks } from "./chunk-builder"

export function analyzeFile(source: string): FileAnalysis {
  const doc = parseFile(source)
  const chunks = buildChunks(doc, source)
  return { doc, chunks }
}
