import { expect, test } from "bun:test"
import { typeChar } from "../commands/commands"
import { run } from "../commands/dispatch"
import { newDocument, openDocument, listDocs } from "../io/docs"
import { exportBoardYaml } from "../io/yaml"
import { S } from "../store/useEditor"
import { execCmd } from "./exec"
import { parseCmd } from "./parse"

function type(text: string) {
  for (const ch of text) typeChar(ch)
}

function freshRect(): string {
  const root = S().doc.boards[S().doc.currentBoard].root
  S().setFocus(root)
  run("insert.rect", 1)
  return S().focus
}

test("parse: commands vs property tokens", () => {
  expect(parseCmd("board 1440x900")).toEqual({ kind: "command", name: "board", args: ["1440x900"], rest: "1440x900" })
  expect(parseCmd("shadow")).toEqual({ kind: "tokens", line: "shadow" })
  expect(parseCmd("  ").kind).toBe("empty")
})

test("command line: property tokens preview live, Space cycles, Esc reverts, Enter commits", () => {
  const id = freshRect()
  run("mode.command", 1)
  expect(S().mode).toBe("command")
  type("shadow")
  expect(S().draft!.nodes[id].props.shadow).toBe("base")
  run("cmd.space", 1)
  expect(S().draft!.nodes[id].props.shadow).toBe("sm")
  run("cmd.cancel", 1)
  expect(S().draft).toBeNull()
  expect(S().doc.nodes[id].props.shadow).toBeUndefined()
  run("mode.command", 1)
  type("shadow")
  run("cmd.space", 1)
  run("cmd.commit", 1)
  expect(S().mode).toBe("normal")
  expect(S().doc.nodes[id].props.shadow).toBe("sm")
  expect(S().cmdHistory.at(-1)).toBe("shadow:sm")
})

test(":name, :lock, :hide", async () => {
  const id = freshRect()
  await execCmd("name card")
  expect(S().doc.nodes[id].name).toBe("card")
  await execCmd("lock")
  expect(S().doc.nodes[id].locked).toBe(true)
  await execCmd("lock")
  expect(S().doc.nodes[id].locked).toBeUndefined()
  await execCmd("hide")
  expect(S().doc.nodes[id].hidden).toBe(true)
})

test(":set and :map / :unmap", async () => {
  await execCmd("set place below")
  expect(S().defaults.placement.place).toBe("below")
  await execCmd("set search doc")
  expect(S().settings.search).toBe("doc")
  await execCmd("set place diagonal")
  expect(S().message).toContain("right or below")
  await execCmd("map normal Z history.undo")
  expect(S().keymapOverride.bindings.normal.Z).toBe("history.undo")
  await execCmd("map normal Q nope.nothing")
  expect(S().message).toContain("no such command")
  await execCmd("unmap normal Z")
  expect(S().keymapOverride.bindings.normal.Z).toBeNull()
})

test(":style save makes a token, :comp save + :icon", async () => {
  const id = freshRect()
  S().commit({ type: "tokens", line: "p4,bg muted" })
  await execCmd("style save card")
  expect(S().styles.card).toContain("p4")
  const other = freshRect()
  S().commit({ type: "tokens", line: "card" })
  expect(S().doc.nodes[other].props.padding).toEqual({ n: 4, unit: "px" })
  S().setFocus(id)
  await execCmd("comp save Box")
  expect(S().components.Box.root).toBe(id)
  await execCmd("icon check")
  const icon = S().doc.nodes[S().focus]
  expect(icon.kind).toBe("icon")
  expect(icon.icon).toBe("check")
  await execCmd("icon nope-not-real")
  expect(S().message).toContain("no such icon")
})

test(":board resizes and creates artboards", async () => {
  await execCmd("board mobile")
  const b = S().doc.boards[S().doc.currentBoard]
  expect([b.width, b.height]).toEqual([390, 844])
  const n = S().doc.boardOrder.length
  await execCmd("board new 1280x800")
  expect(S().doc.boardOrder.length).toBe(n + 1)
  expect(S().doc.boards[S().doc.currentBoard].width).toBe(1280)
})

test("yaml export lists the tree with token styles", () => {
  const id = freshRect()
  S().commit({ type: "tokens", line: "p4" })
  S().commit({ type: "name", name: "yamlbox" })
  const y = exportBoardYaml(S().doc)
  expect(y).toContain("name: yamlbox")
  expect(y).toContain("style: p4")
  expect(id).toBeTruthy()
})

test("documents: new saves the old one, open brings it back with its history", async () => {
  const first = S().doc
  const history = S().past.length
  await execCmd("rename First doc")
  await newDocument()
  expect(S().doc.id).not.toBe(first.id)
  expect(S().past.length).toBe(0)
  expect((await listDocs()).some(d => d.id === first.id)).toBe(true)
  const title = await openDocument("first")
  expect(title).toBe("First doc")
  expect(S().doc.id).toBe(first.id)
  expect(S().past.length).toBe(history)
})
