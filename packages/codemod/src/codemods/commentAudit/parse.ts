import { parseCommentText } from "../../utils/comments"
import type { AuditRequest } from "./render"

export type AuditComment = {
  /* the entry the comment is for */
  id: string
  /* the entry's signature hash when the request was made; without one the comment is applied unchecked */
  hash?: string
  /* the comment, without comment markers */
  text: string
}

export type AuditResponse = {
  comments: AuditComment[]
  /* the blocks that were skipped, and why */
  problems: string[]
}

/* Reads the nonce off the first line of a response, ignoring a code fence around it. */
export function readNonce(text: string): string | undefined {
  const first = getLines(text).find(line => line.trim())
  return first?.trim().match(/^nonce\s+(\S+)$/)?.[1]
}

/*
 * Parses a response into comments keyed by entry id. Each `@@ n` line starts the comment for
 * entry n, which runs until the next one. Comment markers the writer added anyway are
 * stripped. Unknown numbers, repeats and empty blocks are reported as problems and skipped.
 * Throws when the nonce doesn't match the request.
 */
export function parseResponse(text: string, request: Pick<AuditRequest, "nonce" | "ids">): AuditResponse {
  const nonce = readNonce(text)
  if (nonce !== request.nonce) {
    throw new Error(`commentAudit: response nonce ${nonce ?? "(none)"} doesn't match the request's ${request.nonce}`)
  }

  const lines = getLines(text)
  const blocks: { n: number, lines: string[] }[] = []
  const problems: string[] = []
  for (const line of lines.slice(lines.findIndex(line => line.trim()) + 1)) {
    const head = line.match(/^@@\s*(\d+)\s*$/)
    if (head) blocks.push({ n: Number(head[1]), lines: [] })
    else if (blocks.length) blocks.at(-1)!.lines.push(line)
    else if (line.trim() && !problems.length) problems.push("ignored text before the first @@")
  }

  const comments: AuditComment[] = []
  const seen = new Set<number>()
  for (const block of blocks) {
    const entry = request.ids[block.n]
    const comment = parseCommentText(block.lines.join("\n"))
    if (!entry) problems.push(`@@ ${block.n}: no such entry`)
    else if (seen.has(block.n)) problems.push(`@@ ${block.n}: given twice, kept the first`)
    else if (!comment) problems.push(`@@ ${block.n}: empty, skipped`)
    else {
      seen.add(block.n)
      comments.push({ id: entry.id, hash: entry.hash, text: comment })
    }
  }
  return { comments, problems }
}

function getLines(text: string): string[] {
  return text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(line => !line.trim().startsWith("```"))
}
