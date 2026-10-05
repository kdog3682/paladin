import { expect, test } from "bun:test"
import { produce } from "immer"
import { applyTokens } from "../input-mode/apply"
import { tokenize } from "../input-mode/tokenize"
import { insertNode, makeNode, newDoc } from "../model/tree"
import type { Doc } from "../model/types"
import { px } from "../props/parse"
import { alignNodes, distributeNodes, unwrapNodes, wrapNodes } from "./arrange"

function setup(n = 3): { doc: Doc, root: string, ids: string[] } {
  const doc = newDoc()
  const root = doc.boards[doc.currentBoard].root
  const ids: string[] = []
  for (let i = 0; i < n; i++) {
    const node = makeNode("frame", { shape: "rect", props: { x: px(i * 50), y: px(i * 10) } })
    insertNode(doc, node, root)
    ids.push(node.id)
  }
  return { doc, root, ids }
}

test("wrap puts siblings in a new frame at the first one's slot", () => {
  const { doc, root, ids } = setup()
  const next = produce(doc, d => void wrapNodes(d, [ids[1], ids[2]]))
  const kids = next.nodes[root].children
  expect(kids.length).toBe(2)
  const frame = next.nodes[kids[1]]
  expect(frame.children).toEqual([ids[1], ids[2]])
  expect(next.nodes[ids[1]].parent).toBe(frame.id)
  expect(frame.props.x).toEqual(px(50))
  expect(next.nodes[ids[1]].props.x).toBeUndefined()
})

test("unwrap restores children into the parent with absolute offsets", () => {
  const { doc, root, ids } = setup(2)
  const wrapped = produce(doc, d => void wrapNodes(d, ids))
  const frame = wrapped.nodes[root].children[0]
  const next = produce(wrapped, d => void unwrapNodes(d, [frame], { [ids[0]]: { x: 0, y: 0, w: 10, h: 10 }, [ids[1]]: { x: 10, y: 0, w: 10, h: 10 } }))
  expect(next.nodes[root].children).toEqual(ids)
  expect(next.nodes[frame]).toBeUndefined()
  expect(next.nodes[ids[1]].props.x).toEqual(px(10))
})

const boxes = { a: { x: 0, y: 0, w: 10, h: 10 }, b: { x: 30, y: 20, w: 20, h: 10 }, c: { x: 100, y: 40, w: 10, h: 30 } }

function withIds(): { doc: Doc, ids: string[] } {
  const { doc, ids } = setup()
  return { doc, ids }
}

test("align several nodes to their shared bounds", () => {
  const { doc, ids } = withIds()
  const b = { [ids[0]]: boxes.a, [ids[1]]: boxes.b, [ids[2]]: boxes.c }
  const right = produce(doc, d => void alignNodes(d, ids, "r", b))
  expect(right.nodes[ids[0]].props.x).toEqual(px(100))
  expect(right.nodes[ids[1]].props.x).toEqual(px(90))
  const mid = produce(doc, d => void alignNodes(d, ids, "m", b))
  expect(mid.nodes[ids[2]].props.y).toEqual(px(20))
  expect(mid.nodes[ids[0]].props.y).toEqual(px(30))
})

test("align a single node to its parent", () => {
  const { doc, ids } = withIds()
  const next = produce(doc, d => void alignNodes(d, [ids[0]], "c", { [ids[0]]: boxes.a }, { x: 0, y: 0, w: 200, h: 100 }))
  expect(next.nodes[ids[0]].props.x).toEqual(px(95))
})

test("distribute spaces nodes evenly, ends stay put", () => {
  const { doc, ids } = withIds()
  const b = { [ids[0]]: boxes.a, [ids[1]]: boxes.b, [ids[2]]: boxes.c }
  const next = produce(doc, d => void distributeNodes(d, ids, b))
  // widths 10+20+10 over span 110 → gap 35
  expect(next.nodes[ids[0]].props.x).toEqual(px(0))
  expect(next.nodes[ids[1]].props.x).toEqual(px(45))
  expect(next.nodes[ids[2]].props.x).toEqual(px(100))
})

test("flex token on several siblings auto-wraps them first", () => {
  const { doc, root, ids } = setup()
  const next = produce(doc, d => void applyTokens(d, [ids[0], ids[1]], tokenize("flex:dir col")))
  const frame = next.nodes[next.nodes[ids[0]].parent!]
  expect(frame.id).not.toBe(root)
  expect(frame.props.layout).toBe("flex")
  expect(next.nodes[root].children.length).toBe(2)
})
