import { expect, test } from "bun:test"
import { addBoard, insertNode, makeNode, newDoc } from "../model/tree"
import { findMatches, nextAfter, searchOrder } from "./match"

function fixture() {
  const doc = newDoc()
  const root = doc.boards[doc.currentBoard].root
  insertNode(doc, makeNode("frame", { id: "a", name: "Button" }), root)
  insertNode(doc, makeNode("text", { id: "b", text: "Click the BUTTON" }), "a")
  insertNode(doc, makeNode("frame", { id: "c", name: "card" }), root)
  insertNode(doc, makeNode("text", { id: "d", text: "hidden button", hidden: true }), "c")
  return { doc, root }
}

test("matches name, kind and text case-insensitively, skipping hidden nodes", () => {
  const { doc, root } = fixture()
  const order = searchOrder(doc, "board", root)
  expect(findMatches(doc, order, "button")).toEqual(["a", "b"])
  expect(findMatches(doc, order, "TEXT")).toEqual(["b"])
  expect(findMatches(doc, order, "")).toEqual([])
})

test("nextAfter goes strictly after focus and wraps", () => {
  const { doc, root } = fixture()
  const order = searchOrder(doc, "board", root)
  const m = findMatches(doc, order, "button")
  expect(nextAfter(order, m, root)).toBe("a")
  expect(nextAfter(order, m, "a")).toBe("b")
  expect(nextAfter(order, m, "b")).toBe("a")
})

test("doc scope covers every artboard", () => {
  const { doc, root } = fixture()
  addBoard(doc)
  expect(searchOrder(doc, "doc", root).length).toBeGreaterThan(searchOrder(doc, "board", root).length)
})
