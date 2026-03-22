// @paladin/packages/analyze-v2/chunk.types.ts

export type ChunkKind =
  | "imports"
  | "type"
  | "const"
  | "function"
  | "class"
  | "statement"

export type ShortForm = {
  /** e.g. `async fn multiply(x: num, y: num): P<num>` */
  signature: string
  docstr?: string
}

/**
 * A viewable section of the file.
 * Ordering: imports → types → consts → functions → classes → other
 */
export type Chunk = {
  id: string
  kind: ChunkKind
  /** Symbol name, "Imports", or a truncated expression preview */
  label: string
  shortForm: ShortForm
  /** Original source text, preserving formatting */
  longForm: string
  lineRange: [number, number]
}
