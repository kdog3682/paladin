import { wrapNodes } from "../arrange/arrange"
import { layoutOf } from "../model/tree"
import type { Doc } from "../model/types"
import { IMPLIES_FLEX, IMPLIES_GRID, PARENT_ROUTED } from "../props/registry"
import type { Token } from "./tokenize"

export function setProp(doc: Doc, id: string, name: string, value: unknown): void {
  const node = doc.nodes[id]
  if (!node || node.locked) return
  node.props[name] = value
  if (IMPLIES_FLEX.has(name) && node.props.layout !== "flex") node.props.layout = "flex"
  if (IMPLIES_GRID.has(name) && node.props.layout !== "grid") node.props.layout = "grid"
}

function parentsOf(doc: Doc, ids: string[]): string[] {
  return [...new Set(ids.map(id => doc.nodes[id]?.parent).filter((p): p is string => !!p))]
}

/* applies complete tokens to the target ids; works on immer drafts.
   With several nodes selected, flex/layout tokens go to their parent
   a flex token on siblings of an absolute parent first wraps them in a new frame (`:unwrap` reverses it). */
export function applyTokens(doc: Doc, ids: string[], tokens: Token[]): void {
  const impliesContainer = tokens.some(
    t =>
      t.def &&
      t.parsed !== undefined &&
      PARENT_ROUTED.has(t.def.name) &&
      (IMPLIES_FLEX.has(t.def.name) || (t.def.name === "layout" && t.parsed !== "absolute")),
  )
  if (impliesContainer && ids.length > 1) {
    const parents = parentsOf(doc, ids)
    if (parents.length === 1 && layoutOf(doc.nodes[parents[0]]) === "absolute") wrapNodes(doc, ids)
  }
  for (const t of tokens) {
    if (!t.def || t.parsed === undefined) continue
    const targets = PARENT_ROUTED.has(t.def.name) && ids.length > 1 ? parentsOf(doc, ids) : ids
    for (const id of targets) setProp(doc, id, t.def.name, t.parsed)
  }
}
