import { isLength } from "../props/parse"
import { padOf } from "../props/registry"
import { offsetBox, paddingOf, type Box } from "./geometry"
import type { Doc, Node } from "./types"

export type Place = "right" | "below"

export type Placement = {
  /* where a new node goes relative to the previous child in an absolute parent */
  place: Place
  /* px between the previous child and the new node */
  gap: number
}

function estimateBox(node: Node): Box {
  const n = (k: string, fallback: number) => {
    const v = node.props[k]
    return isLength(v) && v.unit === "px" ? v.n : fallback
  }
  return { x: n("x", 0), y: n("y", 0), w: n("width", 100), h: n("height", 100) }
}

/* position for a node already inserted into an absolute parent */
export function placeNext(doc: Doc, parentId: string, newId: string, opts: Placement): { x: number, y: number } {
  const parent = doc.nodes[parentId]
  const idx = parent.children.indexOf(newId)
  const prevId = parent.children
    .slice(0, idx)
    .reverse()
    .find(id => !doc.nodes[id].inline && !doc.nodes[id].hidden)
  const pad = paddingOf(parentId) ?? padOf(parent.props)
  if (!prevId) return { x: pad.l, y: pad.t }
  const b = offsetBox(prevId) ?? estimateBox(doc.nodes[prevId])
  return opts.place === "below"
    ? { x: b.x, y: b.y + b.h + opts.gap }
    : { x: b.x + b.w + opts.gap, y: b.y }
}
