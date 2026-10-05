import { expect, test } from "bun:test"
import { run } from "./commands/dispatch"
import { execCmd } from "./cmdline/exec"
import { arrowsOf } from "./model/binding"
import { exportBoardYaml } from "./io/yaml"
import { hybridAdapter } from "./storage/idbAdapter"
import type { StorageAdapter } from "./storage/adapter"
import { S } from "./store/useEditor"

function two(): [string, string] {
  const root = S().doc.boards[S().doc.currentBoard].root
  S().setFocus(root)
  run("insert.rect", 1)
  const a = S().focus
  S().setFocus(root)
  run("insert.rect", 1)
  return [a, S().focus]
}

test("arrow: selection → target, bound, removed with its node", () => {
  const [a, b] = two()
  S().setFocus(a)
  run("arrow.start", 1)
  expect(S().hint?.purpose).toBe("arrow")
  S().commit({ type: "arrow", to: b })
  const board = S().doc.currentBoard
  const arrows = arrowsOf(S().doc, board)
  expect(arrows.length).toBe(1)
  expect(arrows[0].from).toEqual({ node: a })
  expect(arrows[0].to).toEqual({ node: b })
  expect(exportBoardYaml(S().doc)).toContain("arrows:")
  S().setFocus(b)
  run("edit.delete", 1)
  expect(arrowsOf(S().doc, board).length).toBe(0)
  run("history.undo", 1)
  expect(arrowsOf(S().doc, board).length).toBe(1)
})

test("draw line needs an anchor; free lines are stored in artboard coordinates", () => {
  S().commit({ type: "line", head: true, from: { x: 1, y: 2 }, to: { x: 30, y: 40 } })
  const lines = arrowsOf(S().doc, S().doc.currentBoard).filter(a => !("node" in a.from))
  expect(lines.at(-1)?.to).toEqual({ x: 30, y: 40 })
})

test("locked nodes ignore delete and moves; hidden stays measurable", async () => {
  const [a] = two()
  S().setFocus(a)
  await execCmd("lock")
  const before = S().doc.nodes[a].parent
  run("edit.delete", 1)
  expect(S().doc.nodes[a]).toBeTruthy()
  expect(S().doc.nodes[a].parent).toBe(before)
  await execCmd("lock")
  await execCmd("hide")
  expect(S().doc.nodes[a].hidden).toBe(true)
})

test("hybrid adapter falls back to idb when localStorage can't hold a value", async () => {
  const mem = new Map<string, string>()
  const fallback: StorageAdapter = {
    load: k => mem.get(k) ?? null,
    save: (k, v) => void mem.set(k, v),
    remove: k => void mem.delete(k),
    list: p => [...mem.keys()].filter(k => k.startsWith(p)),
  }
  const full: StorageAdapter = { load: () => null, save: () => undefined, remove: () => undefined, list: () => [] }
  const h = hybridAdapter(full, fallback)
  await h.save("k", "v")
  expect(await h.load("k")).toBe("v")
  expect(await h.list("k")).toEqual(["k"])
})
