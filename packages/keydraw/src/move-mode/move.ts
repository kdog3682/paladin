import type { Doc, Node } from "../model/types"
import { layoutOf } from "../model/tree"

export type MoveDir = "up" | "down" | "left" | "right"

export type MoveStep = {
  /* arrow direction */
  dir: MoveDir
  /* Shift held: ×5 reorder in flex/grid parents, ×10 grid steps in absolute parents */
  big: boolean
  /* count prefix (`5↓`), at least 1 */
  count: number
}

export type MoveOpts = {
  /* px per absolute step, from defaults.editor.gridSize */
  gridSize: number
}

type Len = { n: number; unit: "px" | "%" }

const BIG_REORDER = 5
const BIG_GRID = 10

const DELTA: Record<MoveDir, [number, number]> = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
}

/**
 * Applies the accumulated Move-mode steps to the selection.
 * Mutates `doc` (an immer draft). Ids never change, so focus and
 * selection stay valid. Returns the number of node moves; 0 means
 * nothing could move (e.g. reordering the first child upward).
 *
 * Move mode keeps a growing `steps` list: each arrow previews
 * `{ type: "move", steps }` from the committed doc, `Enter` commits it
 * as one undo step, `Esc` is `preview(null)`, and `.` replays it.
 */
export function applyMove(doc: Doc, ids: string[], steps: MoveStep[], opts: MoveOpts): number {
  const sel = new Set(topLevel(doc, ids).filter(id => !doc.nodes[id]?.locked))
  let moved = 0
  for (const step of steps) {
    for (let k = 0; k < Math.max(1, step.count); k++) moved += applyStep(doc, sel, step, opts)
  }
  return moved
}

function applyStep(doc: Doc, sel: Set<string>, step: MoveStep, opts: MoveOpts): number {
  let moved = 0
  for (const [parentId, kids] of groupByParent(doc, sel)) {
    const parent = doc.nodes[parentId]
    if (layoutOf(parent) === "absolute") moved += moveAbsolute(doc, kids, step, opts)
    else moved += moveInFlow(doc, parentId, kids, sel, step)
  }
  return moved
}

/* ---------- flex / grid parents ---------- */

function moveInFlow(doc: Doc, parentId: string, kids: string[], sel: Set<string>, step: MoveStep): number {
  const parent = doc.nodes[parentId]
  switch (step.dir) {
    case "up":
      return reorder(parent, sel, -1, step.big ? BIG_REORDER : 1)
    case "down":
      return reorder(parent, sel, 1, step.big ? BIG_REORDER : 1)
    case "left":
      return outdent(doc, parentId, kids)
    case "right":
      return indent(doc, parent, kids, sel)
  }
}

/* Moves selected children as blocks; a block stops at the edge or at another selected node. */
function reorder(parent: Node, sel: Set<string>, delta: -1 | 1, times: number): number {
  const ch = parent.children
  let moved = 0
  for (let t = 0; t < times; t++) {
    let any = false
    if (delta < 0) {
      for (let i = 1; i < ch.length; i++) {
        if (sel.has(ch[i]) && !sel.has(ch[i - 1])) {
          swap(ch, i, i - 1)
          any = true
          moved++
        }
      }
    } else {
      for (let i = ch.length - 2; i >= 0; i--) {
        if (sel.has(ch[i]) && !sel.has(ch[i + 1])) {
          swap(ch, i, i + 1)
          any = true
          moved++
        }
      }
    }
    if (!any) break
  }
  return moved
}

/* Selected children become the parent's next siblings, keeping their order. */
function outdent(doc: Doc, parentId: string, kids: string[]): number {
  const parent = doc.nodes[parentId]
  if (!parent.parent) return 0
  const gp = doc.nodes[parent.parent]
  let at = gp.children.indexOf(parentId) + 1
  for (const id of kids) {
    detach(parent, id)
    gp.children.splice(at++, 0, id)
    doc.nodes[id].parent = parent.parent
  }
  return kids.length
}

/* Each selected child becomes the last child of its nearest previous unselected sibling. */
function indent(doc: Doc, parent: Node, kids: string[], sel: Set<string>): number {
  let moved = 0
  for (const id of kids) {
    const ch = parent.children
    const i = ch.indexOf(id)
    let j = i - 1
    while (j >= 0 && (sel.has(ch[j]) || !canHoldChildren(doc.nodes[ch[j]]))) j--
    if (j < 0) continue
    const targetId = ch[j]
    ch.splice(i, 1)
    doc.nodes[targetId].children.push(id)
    doc.nodes[id].parent = targetId
    moved++
  }
  return moved
}

/* ---------- absolute parents ---------- */

function moveAbsolute(doc: Doc, kids: string[], step: MoveStep, opts: MoveOpts): number {
  const n = step.big ? BIG_GRID : 1
  const [dx, dy] = DELTA[step.dir]
  for (const id of kids) {
    const p = doc.nodes[id].props
    if (dx) p.x = shiftLen(p.x, dx * n, opts.gridSize)
    if (dy) p.y = shiftLen(p.y, dy * n, opts.gridSize)
  }
  return kids.length
}

/* px values move by grid steps, snapping on the first one; % values move 1% per step */
function shiftLen(v: unknown, steps: number, grid: number): Len {
  if (isLen(v) && v.unit === "%") return { n: v.n + steps, unit: "%" }
  const base = isLen(v) ? v.n : 0
  return { n: stepPx(base, steps, grid), unit: "px" }
}

/*
 * Moves |steps| grid lines in the direction of `steps`. An off-grid value
 * spends its first step snapping to the nearest grid line in that direction
 * (x=13, grid 8: → 16, ← 8), so after one press the node is on the grid.
 */
function stepPx(base: number, steps: number, grid: number): number {
  if (grid <= 0 || steps === 0) return base + steps
  const dir = Math.sign(steps)
  const r = base / grid
  const onGrid = Math.abs(r - Math.round(r)) < 1e-6
  const first = onGrid ? Math.round(r) + dir : dir > 0 ? Math.ceil(r) : Math.floor(r)
  return (first + dir * (Math.abs(steps) - 1)) * grid
}

/* ---------- helpers ---------- */

/* Drops ids whose ancestor is also selected: moving the ancestor carries them. */
function topLevel(doc: Doc, ids: string[]): string[] {
  const set = new Set(ids)
  return ids.filter((id) => {
    let p = doc.nodes[id]?.parent
    while (p) {
      if (set.has(p)) return false
      p = doc.nodes[p]?.parent
    }
    return !!doc.nodes[id]
  })
}

/* parent id → selected children in child order. The artboard root has no parent and is skipped. */
function groupByParent(doc: Doc, sel: Set<string>): Map<string, string[]> {
  const groups = new Map<string, string[]>()
  for (const id of sel) {
    const parentId = doc.nodes[id]?.parent
    if (!parentId) continue
    const list = groups.get(parentId) ?? []
    list.push(id)
    groups.set(parentId, list)
  }
  for (const [parentId, list] of groups) {
    const ch = doc.nodes[parentId].children
    list.sort((a, b) => ch.indexOf(a) - ch.indexOf(b))
  }
  return groups
}

function canHoldChildren(node: Node | undefined): boolean {
  return !!node && node.kind !== "text"
}

function detach(parent: Node, id: string) {
  const i = parent.children.indexOf(id)
  if (i >= 0) parent.children.splice(i, 1)
}

function swap<T>(arr: T[], i: number, j: number) {
  const t = arr[i]
  arr[i] = arr[j]
  arr[j] = t
}

function isLen(v: unknown): v is Len {
  return !!v && typeof v === "object" && "n" in v && "unit" in v
}
