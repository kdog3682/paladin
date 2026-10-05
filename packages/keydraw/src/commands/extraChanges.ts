import { alignNodes, distributeNodes, unwrapNodes, wrapNodes, type AlignEdge, type Boxes } from "../arrange/arrange"
import type { Box } from "../model/geometry"
import { boardOfNode } from "../model/binding"
import { uid } from "../model/tree"
import type { Doc } from "../model/types"
import { applyMove, type MoveStep } from "../move-mode/move"
import { defaultsFor } from "../ui/attrs"

/* Move mode: the whole session's steps, applied to the selection as one change */
export type MoveChange = {
  type: "move"
  /* accumulated arrow steps since `m` */
  steps: MoveStep[]
  /* captured at creation so `.` repeats with the same grid */
  gridSize: number
}

/* Attributes panel: set props directly. `undefined` deletes the prop (back to default) */
export type SetPropsChange = {
  type: "setProps"
  props: Record<string, unknown>
}

/* Attributes panel `x`: reset props on each selected node to that node's own default */
export type ResetPropsChange = {
  type: "resetProps"
  /* canonical prop names to reset */
  names: string[]
  /* defaults.nodes, captured at creation so the change stays pure and `.` repeats the same way */
  nodeDefaults: Record<string, Record<string, unknown>>
}

/* `gw`: wrap the selection (siblings of one parent) in a new frame */
export type WrapChange = { type: "wrap" }

/* `:unwrap`: replace each selected frame with its children; boxes are the children's offset boxes */
export type UnwrapChange = { type: "unwrap", boxes: Boxes }

/* `ga` + edge, `gd`: boxes are measured when the change is created */
export type AlignChange = { type: "align", edge: AlignEdge, boxes: Boxes, parentBox?: Box }
export type DistributeChange = { type: "distribute", boxes: Boxes }

/* `:lock` / `:hide`: set (or toggle when `value` is undefined) a flag on each selected node */
export type FlagChange = { type: "flag", key: "locked" | "hidden", value?: boolean }

/* `:name`: name every selected node (an empty name clears it) */
export type NameChange = { type: "name", name: string }

/* `a` + hint label: an arrow from each selected node to the target (bound, follows moves) */
export type ArrowChange = { type: "arrow", to: string }

/* a free line (with an arrowhead when `head`) between two artboard points */
export type LineChange = { type: "line", head: boolean, from: { x: number, y: number }, to: { x: number, y: number } }

export type ExtraChange = ArrowChange | LineChange | FlagChange | NameChange | MoveChange | SetPropsChange | ResetPropsChange | WrapChange | UnwrapChange | AlignChange | DistributeChange

const EXTRA_TYPES = new Set(["move", "setProps", "resetProps", "wrap", "unwrap", "align", "distribute", "flag", "name", "arrow", "line"])

export function isExtraChange(change: { type: string }): change is ExtraChange {
  return EXTRA_TYPES.has(change.type)
}

/**
 * Reducer for the change types added in milestones 6–7.
 * `ids` is the current selection (selectionOf), so `.` acts on whatever is selected now.
 */
export function applyExtraChange(draft: Doc, change: ExtraChange, ids: string[]): { moved?: number, focus?: string, clearSelection?: boolean } {
  switch (change.type) {
    case "move":
      return { moved: applyMove(draft, ids, change.steps, { gridSize: change.gridSize }) }
    case "wrap": {
      const frame = wrapNodes(draft, ids)
      return frame ? { focus: frame, clearSelection: true } : {}
    }
    case "unwrap": {
      const freed = unwrapNodes(draft, ids, change.boxes)
      return freed.length ? { focus: freed[0], clearSelection: true } : {}
    }
    case "align":
      alignNodes(draft, ids, change.edge, change.boxes, change.parentBox)
      return {}
    case "distribute":
      distributeNodes(draft, ids, change.boxes)
      return {}
    case "flag": {
      const nodes = ids.map(id => draft.nodes[id]).filter(n => n?.parent)
      const value = change.value ?? !nodes.every(n => n[change.key])
      for (const n of nodes) {
        if (value) n[change.key] = true
        else delete n[change.key]
      }
      return {}
    }
    case "name":
      for (const id of ids) {
        const n = draft.nodes[id]
        if (!n) continue
        if (change.name) n.name = change.name
        else delete n.name
      }
      return {}
    case "arrow": {
      draft.arrows ??= {}
      const board = boardOfNode(draft, change.to)
      for (const id of ids) {
        if (id === change.to || !draft.nodes[id] || boardOfNode(draft, id) !== board || !board) continue
        const a = { id: uid("a"), board, head: true, from: { node: id }, to: { node: change.to } }
        draft.arrows[a.id] = a
      }
      return {}
    }
    case "line": {
      draft.arrows ??= {}
      const a = { id: uid("a"), board: draft.currentBoard, head: change.head, from: change.from, to: change.to }
      draft.arrows[a.id] = a
      return {}
    }
    case "setProps":
      for (const id of ids) {
        const props = draft.nodes[id]?.props
        if (!props) continue
        for (const [k, v] of Object.entries(change.props)) {
          if (v === undefined) delete props[k]
          else props[k] = v
        }
      }
      return {}
    case "resetProps":
      for (const id of ids) {
        const node = draft.nodes[id]
        if (!node) continue
        const defs = defaultsFor(change.nodeDefaults, node)
        for (const name of change.names) {
          if (defs[name] === undefined) delete node.props[name]
          else node.props[name] = defs[name]
        }
      }
      return {}
  }
}
