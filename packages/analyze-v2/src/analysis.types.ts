// @paladin/packages/analyze-v2/analysis.types.ts

import type { FileDoc } from "./parse-file.types"
import type { Chunk } from "./chunk.types"

export type FileAnalysis = {
  doc: FileDoc
  chunks: Chunk[]
}
