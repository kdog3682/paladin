import { readingOrder } from "../model/tree"
import type { Doc, Node } from "../model/types"

/* case-insensitive substring over name, kind, component name and text content */
export function nodeMatches(node: Node, query: string): boolean {
  const q = query.toLowerCase()
  if (!q) return false
  return [node.name, node.kind, node.component, node.text].some(f => f?.toLowerCase().includes(q))
}

/* ids in search order: the current artboard, or every artboard in display order */
export function searchOrder(doc: Doc, scope: "board" | "doc", currentRoot: string): string[] {
  const roots = scope === "doc" ? doc.boardOrder.map(id => doc.boards[id].root) : [currentRoot]
  return roots.flatMap(r => readingOrder(doc, r)).filter(id => !doc.nodes[id].hidden)
}

export function findMatches(doc: Doc, order: string[], query: string): string[] {
  return order.filter(id => nodeMatches(doc.nodes[id], query))
}

/* first match strictly after `focus` in search order, wrapping to the first match */
export function nextAfter(order: string[], matches: string[], focus: string): string | undefined {
  const at = new Map(order.map((id, i) => [id, i]))
  const f = at.get(focus) ?? -1
  return matches.find(id => (at.get(id) ?? -1) > f) ?? matches[0]
}
