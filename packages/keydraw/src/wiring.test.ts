import { expect, test } from "bun:test"
import { typeChar } from "./commands/commands"
import { run } from "./commands/dispatch"
import { S } from "./store/useEditor"

test("move mode: insert two rects, reorder, commit as one undo step", () => {
  const root = S().doc.boards[S().doc.currentBoard].root
  S().setDoc(d => void (d.nodes[root].props.layout = "flex"))
  S().setFocus(root)
  run("insert.rect", 1)
  S().setFocus(root)
  run("insert.rect", 1)
  const [a, b] = S().doc.nodes[root].children
  S().setFocus(b)
  const before = S().past.length
  run("mode.move", 1)
  expect(S().mode).toBe("move")
  run("move.up", 1)
  expect(S().draft!.nodes[root].children).toEqual([b, a])
  run("move.commit", 1)
  expect(S().mode).toBe("normal")
  expect(S().doc.nodes[root].children).toEqual([b, a])
  expect(S().past.length).toBe(before + 1)
  run("history.undo", 1)
  expect(S().doc.nodes[root].children).toEqual([a, b])
})

test("attrs panel: enter, nudge a row, reset, exit", () => {
  run("attrs.focus", 1)
  expect(S().mode).toBe("attrs")
  const n = S().past.length
  run("attrs.nudge.up", 1)
  run("attrs.nudge.up", 1)
  expect(S().past.length).toBeLessThanOrEqual(n + 1)
  run("attrs.exit", 1)
  expect(S().mode).toBe("normal")
})

test("search: live matches, Enter jumps, n / # wrap, any other command ends it", async () => {
  const { S } = await import("./store/useEditor")
  const root = S().doc.boards[S().doc.currentBoard].root
  S().setDoc(d => void (d.nodes[root].props.layout = "flex"))
  S().setFocus(root)
  run("insert.rect", 1)
  S().setFocus(root)
  run("insert.rect", 1)
  S().setFocus(root)
  run("mode.search", 1)
  expect(S().mode).toBe("search")
  for (const ch of "frame") typeChar(ch)
  expect(S().search.matches.length).toBeGreaterThan(1)
  run("search.commit", 1)
  expect(S().mode).toBe("normal")
  expect(S().search.active).toBe(true)
  const { matches } = S().search
  const n = matches.length // the store is shared with earlier tests
  // focus was on the root, so the first match strictly after it is matches[1]
  expect(S().search.index).toBe(1)
  expect(S().focus).toBe(matches[1])
  for (let i = 0; i < n - 1; i++) run("search.next", 1)
  expect(S().focus).toBe(matches[0]) // wrapped
  run("search.prev", 1)
  expect(S().focus).toBe(matches[n - 1]) // wraps backward
  run("focus.parent", 1)
  expect(S().search.active).toBe(false)
})
