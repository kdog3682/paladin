import type { ScopeTable } from "../keys/extend"
import { offsetBox, type Box } from "../model/geometry"
import { S } from "../store/useEditor"
import { selectionOf } from "../store/slices/selection"
import type { AlignEdge, Boxes } from "./arrange"
import { ARRANGE_BINDINGS, ARRANGE_COMMANDS } from "./bindings"

export { ARRANGE_BINDINGS, ARRANGE_COMMANDS }





function measure(ids: string[]): Boxes {
  const out: Boxes = {}
  for (const id of ids) {
    const b = offsetBox(id)
    if (b) out[id] = b
  }
  return out
}

function align(edge: AlignEdge) {
  const s = S()
  const ids = selectionOf(s)
  const parent = s.doc.nodes[ids[0]]?.parent
  if (!parent) return s.say("nothing to align")
  const boxes = measure(ids)
  const parentBox: Box | undefined = offsetBox(parent) ?? undefined
  s.commit({ type: "align", edge, boxes, parentBox })
}

function distribute() {
  const s = S()
  s.commit({ type: "distribute", boxes: measure(selectionOf(s)) })
}

function unwrap() {
  const s = S()
  const kids = selectionOf(s).flatMap(id => s.doc.nodes[id]?.children ?? [])
  s.commit({ type: "unwrap", boxes: measure(kids) })
}

export const arrangeHandlers: Record<string, (count: number) => void> = {
  "arrange.wrap": () => S().commit({ type: "wrap" }),
  "arrange.unwrap": () => unwrap(),
  "arrange.align.l": () => align("l"),
  "arrange.align.c": () => align("c"),
  "arrange.align.r": () => align("r"),
  "arrange.align.t": () => align("t"),
  "arrange.align.m": () => align("m"),
  "arrange.align.b": () => align("b"),
  "arrange.distribute": () => distribute(),
}
