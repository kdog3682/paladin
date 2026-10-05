/*
 * Doc changes are data. Each reducer mutates an immer draft and acts on the
 * focus/selection in ctx (not on stored ids), so "." can replay a change
 * against whatever is focused now.
 */
import { applyTokens } from "../input-mode/apply"
import { nudgeValue } from "../input-mode/nudge"
import { tokenize } from "../input-mode/tokenize"
import { pruneArrows } from "../model/binding"
import { placeNext } from "../model/placement"
import { cloneSubtree, insertNode, insertSubtree, layoutOf, makeNode, removeNode, siblings, topLevel, uid } from "../model/tree"
import type { Doc, Node, Props } from "../model/types"
import { px } from "../props/parse"
import { byName } from "../props/registry"
import type { Defaults } from "../store/slices/defaults"
import { applyExtraChange, isExtraChange, type ExtraChange } from "./extraChanges"

export type InsertKind = "rect" | "ellipse" | "text" | "span"

/* yanked subtrees, snapshotted with their original ids */
export type Clip = { roots: string[], nodes: Record<string, Node> }

export type Change =
  | { type: "tokens", line: string }
  | { type: "delete" }
  | {
    type: "insert"
    kind: InsertKind
    /* insert after the focused node instead of as its last child */
    sibling: boolean
    /* fixed id so a preview and its commit share the node */
    id?: string
    text?: string
  }
  | { type: "paste", sibling: boolean, clip: Clip }
  | { type: "pasteStyle", props: Props }
  | { type: "setText", id: string, text: string }
  | { type: "nudge", prop: string, delta: number }
  /* icon node as the last child (or next sibling) of the focused node */
  | { type: "icon", icon: string, sibling: boolean }
  | ExtraChange

export type ChangeCtx = {
  focus: string
  /* explicit selection, or just the focused node */
  selection: string[]
  defaults: Defaults
}

export type ChangeResult = {
  /* node to focus after the change */
  focus?: string
  clearSelection?: boolean
}

function target(doc: Doc, focus: string, sibling: boolean): { parentId: string, index?: number } {
  const node = doc.nodes[focus]
  if (sibling && node.parent) return { parentId: node.parent, index: doc.nodes[node.parent].children.indexOf(focus) + 1 }
  return { parentId: focus }
}

/* insertion rule: absolute parents place the node next to the previous child */
function placeIfAbsolute(doc: Doc, node: Node, ctx: ChangeCtx): void {
  const parent = node.parent ? doc.nodes[node.parent] : null
  if (!parent || node.inline || layoutOf(parent) !== "absolute") return
  const p = placeNext(doc, parent.id, node.id, ctx.defaults.placement)
  node.props.x = px(Math.round(p.x))
  node.props.y = px(Math.round(p.y))
}

function makeInsert(kind: InsertKind, ctx: ChangeCtx, id?: string, text?: string): Node {
  const props = structuredClone(ctx.defaults.nodes[kind] ?? {})
  if (kind === "span") return makeNode("text", { id: id ?? uid(), inline: true, text: text ?? "", props })
  if (kind === "text") return makeNode("text", { id: id ?? uid(), text: text ?? "Text", props })
  return makeNode("frame", { id: id ?? uid(), shape: kind === "ellipse" ? "ellipse" : "rect", props })
}

function focusAfterDelete(doc: Doc, ids: string[]): string {
  const gone = new Set(ids)
  const last = ids[ids.length - 1]
  const sib = siblings(doc, last)
  const i = sib.indexOf(last)
  const after = sib.slice(i + 1).find(x => !gone.has(x))
  if (after) return after
  const before = sib.slice(0, i).reverse().find(x => !gone.has(x))
  if (before) return before
  let p = doc.nodes[last].parent
  while (p && gone.has(p)) p = doc.nodes[p].parent
  return p ?? last
}

export function applyChange(doc: Doc, change: Change, ctx: ChangeCtx): ChangeResult {
  if (isExtraChange(change)) {
    const { focus, clearSelection } = applyExtraChange(doc, change, ctx.selection)
    return { focus, clearSelection }
  }
  switch (change.type) {
    case "tokens": {
      applyTokens(doc, ctx.selection, tokenize(change.line))
      return {}
    }
    case "delete": {
      const ids = topLevel(doc, ctx.selection).filter(id => doc.nodes[id].parent && !doc.nodes[id].locked)
      if (!ids.length) return {}
      const focus = focusAfterDelete(doc, ids)
      for (const id of ids) removeNode(doc, id)
      pruneArrows(doc)
      return { focus, clearSelection: true }
    }
    case "insert": {
      const { parentId, index } = target(doc, ctx.focus, change.sibling)
      const node = makeInsert(change.kind, ctx, change.id, change.text)
      insertNode(doc, node, parentId, index)
      placeIfAbsolute(doc, doc.nodes[node.id], ctx)
      return { focus: node.id }
    }
    case "paste": {
      const { parentId, index } = target(doc, ctx.focus, change.sibling)
      let i = index
      let focus: string | undefined
      for (const root of change.clip.roots) {
        const copy = cloneSubtree(change.clip.nodes, root)
        insertSubtree(doc, copy.nodes, copy.root, parentId, i)
        if (i !== undefined) i++
        placeIfAbsolute(doc, doc.nodes[copy.root], ctx)
        focus = copy.root
      }
      return { focus }
    }
    case "pasteStyle": {
      for (const id of ctx.selection) {
        const node = doc.nodes[id]
        if (!node || node.locked) continue
        const { x, y } = node.props
        node.props = structuredClone(change.props)
        if (x !== undefined) node.props.x = x
        if (y !== undefined) node.props.y = y
      }
      return {}
    }
    case "setText": {
      const node = doc.nodes[change.id]
      if (node) node.text = change.text
      return {}
    }
    case "icon": {
      const { parentId, index } = target(doc, ctx.focus, change.sibling)
      const node = makeNode("icon", { icon: change.icon, props: structuredClone(ctx.defaults.nodes.icon ?? {}) })
      insertNode(doc, node, parentId, index)
      placeIfAbsolute(doc, doc.nodes[node.id], ctx)
      return { focus: node.id }
    }
    case "nudge": {
      const def = byName.get(change.prop)
      if (!def) return {}
      for (const id of ctx.selection) {
        const node = doc.nodes[id]
        if (!node || node.locked) continue
        node.props[change.prop] = nudgeValue(def, node.props[change.prop], change.delta)
      }
      return {}
    }
  }
}

/* drop ids so a repeated change creates fresh nodes */
export function forRepeat(change: Change): Change {
  if (change.type === "insert") return { ...change, id: undefined }
  return change
}
