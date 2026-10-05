/*
 * Pure reducers for wrap, unwrap, align and distribute (milestone 9).
 * Measurements are passed in (captured from the DOM when the change is created)
 * so the reducers stay pure and `.` can replay them.
 */
import type { Box } from "../model/geometry"
import { detach, insertNode, layoutOf, makeNode, topLevel } from "../model/tree"
import type { Doc } from "../model/types"
import { px } from "../props/parse"

export type AlignEdge = "l" | "c" | "r" | "t" | "m" | "b"

export type Boxes = Record<string, Box>

/* ids from the selection that share the first node's parent, in sibling order */
function siblingGroup(doc: Doc, ids: string[]): { parent: string, ids: string[] } | null {
  const top = topLevel(doc, ids).filter(id => doc.nodes[id].parent && !doc.nodes[id].locked)
  if (!top.length) return null
  const parent = doc.nodes[top[0]].parent!
  const group = top.filter(id => doc.nodes[id].parent === parent)
  const order = doc.nodes[parent].children
  return { parent, ids: group.sort((a, b) => order.indexOf(a) - order.indexOf(b)) }
}

const numOf = (v: unknown): number | undefined =>
  v && typeof v === "object" && "n" in v && (v as { unit: string }).unit === "px" ? (v as { n: number }).n : undefined

/* wraps the selection (siblings of one parent) in a new frame; returns the frame id */
export function wrapNodes(doc: Doc, ids: string[]): string | null {
  const group = siblingGroup(doc, ids)
  if (!group) return null
  const parent = doc.nodes[group.parent]
  const at = Math.min(...group.ids.map(id => parent.children.indexOf(id)))
  const frame = makeNode("frame", { shape: "rect" })
  if (layoutOf(parent) === "absolute") {
    const xs = group.ids.map(id => numOf(doc.nodes[id].props.x) ?? 0)
    const ys = group.ids.map(id => numOf(doc.nodes[id].props.y) ?? 0)
    frame.props.x = px(Math.min(...xs))
    frame.props.y = px(Math.min(...ys))
  }
  insertNode(doc, frame, group.parent, at)
  for (const id of group.ids) {
    detach(doc, id)
    const node = doc.nodes[id]
    delete node.props.x
    delete node.props.y
    insertNode(doc, node, frame.id)
  }
  return frame.id
}

/* replaces each selected frame with its children; `boxes` are the children's offset boxes inside the frame */
export function unwrapNodes(doc: Doc, ids: string[], boxes: Boxes): string[] {
  const freed: string[] = []
  for (const id of topLevel(doc, ids)) {
    const frame = doc.nodes[id]
    if (!frame?.parent || frame.locked || !frame.children.length) continue
    const parent = doc.nodes[frame.parent]
    const absolute = layoutOf(parent) === "absolute"
    const fx = numOf(frame.props.x) ?? 0
    const fy = numOf(frame.props.y) ?? 0
    let at = parent.children.indexOf(id)
    for (const cid of [...frame.children]) {
      detach(doc, cid)
      const child = doc.nodes[cid]
      if (absolute) {
        const b = boxes[cid]
        child.props.x = px(Math.round(fx + (b?.x ?? 0)))
        child.props.y = px(Math.round(fy + (b?.y ?? 0)))
      }
      insertNode(doc, child, parent.id, ++at)
      freed.push(cid)
    }
    detach(doc, id)
    delete doc.nodes[id]
  }
  return freed
}

/*
 * Aligns nodes of an absolute parent. Several nodes align to their shared bounds;
 * one node aligns to the parent (`parentBox`, whose x/y are ignored).
 */
export function alignNodes(doc: Doc, ids: string[], edge: AlignEdge, boxes: Boxes, parentBox?: Box): number {
  const group = siblingGroup(doc, ids)
  if (!group || layoutOf(doc.nodes[group.parent]) !== "absolute") return 0
  const targets = group.ids.filter(id => boxes[id])
  if (!targets.length) return 0
  let ref: Box
  if (targets.length > 1) {
    const x0 = Math.min(...targets.map(id => boxes[id].x))
    const y0 = Math.min(...targets.map(id => boxes[id].y))
    const x1 = Math.max(...targets.map(id => boxes[id].x + boxes[id].w))
    const y1 = Math.max(...targets.map(id => boxes[id].y + boxes[id].h))
    ref = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
  } else if (parentBox) ref = { x: 0, y: 0, w: parentBox.w, h: parentBox.h }
  else return 0
  for (const id of targets) {
    const b = boxes[id]
    const props = doc.nodes[id].props
    if (edge === "l") props.x = px(Math.round(ref.x))
    else if (edge === "c") props.x = px(Math.round(ref.x + (ref.w - b.w) / 2))
    else if (edge === "r") props.x = px(Math.round(ref.x + ref.w - b.w))
    else if (edge === "t") props.y = px(Math.round(ref.y))
    else if (edge === "m") props.y = px(Math.round(ref.y + (ref.h - b.h) / 2))
    else props.y = px(Math.round(ref.y + ref.h - b.h))
  }
  return targets.length
}

/*
 * Spaces nodes of an absolute parent evenly along the axis with the larger spread,
 * keeping the first and last in place. Needs at least three nodes.
 */
export function distributeNodes(doc: Doc, ids: string[], boxes: Boxes): number {
  const group = siblingGroup(doc, ids)
  if (!group || layoutOf(doc.nodes[group.parent]) !== "absolute") return 0
  const targets = group.ids.filter(id => boxes[id])
  if (targets.length < 3) return 0
  const horizontal =
    Math.max(...targets.map(id => boxes[id].x + boxes[id].w)) - Math.min(...targets.map(id => boxes[id].x)) >=
    Math.max(...targets.map(id => boxes[id].y + boxes[id].h)) - Math.min(...targets.map(id => boxes[id].y))
  const [pos, size, key] = horizontal ? (["x", "w", "x"] as const) : (["y", "h", "y"] as const)
  const sorted = [...targets].sort((a, b) => boxes[a][pos] - boxes[b][pos])
  const first = boxes[sorted[0]]
  const last = boxes[sorted[sorted.length - 1]]
  const total = sorted.reduce((sum, id) => sum + boxes[id][size], 0)
  const gap = (last[pos] + last[size] - first[pos] - total) / (sorted.length - 1)
  let cursor = first[pos]
  for (const id of sorted) {
    doc.nodes[id].props[key] = px(Math.round(cursor))
    cursor += boxes[id][size] + gap
  }
  return sorted.length
}
