import type { Artboard, Doc, Layout, Node, NodeKind } from "./types"

let counter = 0

export function uid(prefix = "n"): string {
  counter = (counter + 1) % 1_000_000
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

export function makeNode(kind: NodeKind, init: Partial<Node> = {}): Node {
  return { id: uid(), kind, props: {}, children: [], parent: null, ...init }
}

/* "2026-10-05 14:32" */
export function timestampTitle(t = Date.now()): string {
  const d = new Date(t)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export const BOARD_PRESETS: Record<string, [number, number]> = {
  desktop: [1440, 900],
  laptop: [1280, 800],
  tablet: [834, 1194],
  mobile: [390, 844],
}

/* adds a new artboard (and its root frame) to the doc; works on drafts */
export function addBoard(doc: Doc, width = 1440, height = 900, rootProps: Node["props"] = {}): Artboard {
  const root = makeNode("frame", { props: { ...rootProps } })
  const board: Artboard = {
    id: uid("b"),
    name: `Artboard ${doc.boardOrder.length + 1}`,
    root: root.id,
    width,
    height,
  }
  doc.nodes[root.id] = root
  doc.boards[board.id] = board
  doc.boardOrder.push(board.id)
  return board
}

export function newDoc(rootProps: Node["props"] = {}): Doc {
  const now = Date.now()
  const doc: Doc = {
    id: uid("d"),
    title: timestampTitle(now),
    createdAt: now,
    nodes: {},
    boards: {},
    boardOrder: [],
    currentBoard: "",
  }
  doc.currentBoard = addBoard(doc, 1440, 900, rootProps).id
  return doc
}

export function currentRoot(doc: Doc): string {
  return doc.boards[doc.currentBoard].root
}

export function layoutOf(node: Node): Layout {
  return (node.props.layout as Layout | undefined) ?? "absolute"
}

export function rootOf(doc: Doc, id: string): string {
  let cur = id
  while (doc.nodes[cur]?.parent) cur = doc.nodes[cur].parent!
  return cur
}

export function boardOfRoot(doc: Doc, rootId: string): Artboard | undefined {
  return Object.values(doc.boards).find(b => b.root === rootId)
}

export function siblings(doc: Doc, id: string): string[] {
  const p = doc.nodes[id]?.parent
  return p ? doc.nodes[p].children : [id]
}

export function indexInParent(doc: Doc, id: string): number {
  return siblings(doc, id).indexOf(id)
}

/* ids from the root down to id, inclusive */
export function pathTo(doc: Doc, id: string): string[] {
  const out: string[] = []
  let cur: string | null = id
  while (cur && doc.nodes[cur]) {
    out.unshift(cur)
    cur = doc.nodes[cur].parent
  }
  return out
}

export function isAncestor(doc: Doc, a: string, b: string): boolean {
  let cur = doc.nodes[b]?.parent ?? null
  while (cur) {
    if (cur === a) return true
    cur = doc.nodes[cur].parent
  }
  return false
}

/* preorder walk of a tree */
export function readingOrder(doc: Doc, rootId: string): string[] {
  const out: string[] = []
  const walk = (id: string) => {
    const n = doc.nodes[id]
    if (!n) return
    out.push(id)
    n.children.forEach(walk)
  }
  walk(rootId)
  return out
}

/* drops ids nested inside other ids of the set, sorted in reading order */
export function topLevel(doc: Doc, ids: string[]): string[] {
  const set = new Set(ids.filter(id => doc.nodes[id]))
  const kept = [...set].filter(id => ![...set].some(other => other !== id && isAncestor(doc, other, id)))
  if (kept.length < 2) return kept
  const order = readingOrder(doc, rootOf(doc, kept[0]))
  return kept.sort((a, b) => order.indexOf(a) - order.indexOf(b))
}

export function insertNode(doc: Doc, node: Node, parentId: string, index?: number): void {
  const parent = doc.nodes[parentId]
  node.parent = parentId
  doc.nodes[node.id] = node
  const i = index === undefined ? parent.children.length : Math.max(0, Math.min(index, parent.children.length))
  parent.children.splice(i, 0, node.id)
}

/* inserts a detached subtree whose nodes are all in `nodes` */
export function insertSubtree(doc: Doc, nodes: Record<string, Node>, rootId: string, parentId: string, index?: number): void {
  Object.assign(doc.nodes, nodes)
  const root = doc.nodes[rootId]
  root.parent = null
  insertNode(doc, root, parentId, index)
}

export function detach(doc: Doc, id: string): void {
  const n = doc.nodes[id]
  if (!n?.parent) return
  const parent = doc.nodes[n.parent]
  parent.children.splice(parent.children.indexOf(id), 1)
  n.parent = null
}

export function collectSubtree(doc: Doc, id: string): Node[] {
  return readingOrder(doc, id).map(x => doc.nodes[x])
}

export function removeNode(doc: Doc, id: string): void {
  const ids = readingOrder(doc, id)
  detach(doc, id)
  for (const x of ids) delete doc.nodes[x]
}

/* deep copy of a subtree with fresh ids */
export function cloneSubtree(nodes: Record<string, Node>, rootId: string): { root: string, nodes: Record<string, Node> } {
  const out: Record<string, Node> = {}
  const walk = (id: string, parent: string | null): string => {
    const src = nodes[id]
    const nid = uid()
    const copy: Node = { ...structuredClone(src), id: nid, parent, children: [] }
    out[nid] = copy
    copy.children = src.children.map(c => walk(c, nid))
    return nid
  }
  return { root: walk(rootId, null), nodes: out }
}

export function nodeLabel(doc: Doc, id: string): string {
  const n = doc.nodes[id]
  if (!n) return "?"
  if (n.name) return n.name
  if (!n.parent) return boardOfRoot(doc, id)?.name ?? "Artboard"
  if (n.kind === "text") {
    const t = (n.text ?? "").replace(/\s+/g, " ").trim()
    return t ? `"${t.length > 16 ? t.slice(0, 15) + "…" : t}"` : n.inline ? "span" : "text"
  }
  if (n.kind === "icon") return `icon:${n.icon ?? "?"}`
  if (n.kind === "instance") return n.component ?? "instance"
  return n.shape ?? "frame"
}
