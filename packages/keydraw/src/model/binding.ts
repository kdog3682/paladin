import { rootOf } from "./tree"
import type { Arrow, Doc } from "./types"

/* an endpoint: a node (bound, follows moves) or a point in artboard coordinates */
export type Endpoint = Arrow["from"]

export const isBound = (e: Endpoint): e is { node: string } => "node" in e

export function arrowsOf(doc: Doc, boardId: string): Arrow[] {
  return Object.values(doc.arrows ?? {}).filter(a => a.board === boardId)
}

/* drops arrows whose bound nodes are gone; works on drafts */
export function pruneArrows(doc: Doc): void {
  if (!doc.arrows) return
  for (const [id, a] of Object.entries(doc.arrows)) {
    const dead = [a.from, a.to].some(e => isBound(e) && !doc.nodes[e.node])
    if (dead) delete doc.arrows[id]
  }
}

/* the board an endpoint pair belongs to */
export function boardOfNode(doc: Doc, node: string): string | undefined {
  const root = rootOf(doc, node)
  return Object.values(doc.boards).find(b => b.root === root)?.id
}
