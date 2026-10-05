import { expect, test } from "bun:test"
import { typeChar } from "../commands/commands"
import { run } from "../commands/dispatch"
import { execCmd } from "../cmdline/exec"
import { S } from "../store/useEditor"
import { builtinDefaults } from "../store/slices/defaults"
import { defaultsView, helpShortcuts, iconsView, keysView, loaderView } from "./modalCommands"

function type(text: string) {
  for (const ch of text) typeChar(ch)
}

test(":defaults opens the modal on a section; Esc closes it", async () => {
  await execCmd("defaults editor")
  expect(S().mode).toBe("modal")
  expect(S().modal.kind).toBe("defaults")
  expect(defaultsView().map(r => r.key)).toContain("gridSize")
  run("modal.close", 1)
  expect(S().mode).toBe("normal")
  expect(S().modal.kind).toBeNull()
})

test("defaults rows: nudge, cycle, edit inline, reset", async () => {
  await execCmd("defaults editor")
  const grid = () => S().defaults.editor.gridSize
  const start = grid()
  run("modal.nudge.up", 1)
  expect(grid()).toBe(start + 1)
  run("modal.reset", 1)
  expect(grid()).toBe(builtinDefaults.editor.gridSize)
  run("modal.edit", 1)
  expect(S().mode).toBe("modal-text")
  type("0")
  run("modal.text.commit", 1) // 80
  expect(grid()).toBe(80)
  run("modal.text.cancel", 1)
  run("modal.reset", 1)
  // bool rows cycle
  run("modal.left", 1) // layout
  run("modal.right", 3)
  await execCmd("defaults layout")
  const before = S().defaults.layout.statusLine
  run("modal.cycle", 1)
  expect(S().defaults.layout.statusLine).toBe(!before)
  run("modal.reset", 1)
  run("modal.close", 1)
})

test("defaults input: tokens set the section's node defaults; board scope overrides", async () => {
  await execCmd("defaults rect")
  run("modal.input", 1)
  type("w30p h50p")
  run("modal.text.commit", 1)
  expect(S().defaults.nodes.rect.width).toEqual({ n: 30, unit: "%" })
  expect(S().defaults.nodes.rect.height).toEqual({ n: 50, unit: "%" })
  run("modal.text.cancel", 1)
  run("modal.scope", 1)
  expect(S().modal.scope).toBe("board")
  run("modal.input", 1)
  type("w10p")
  run("modal.text.commit", 1)
  run("modal.text.cancel", 1)
  const board = S().doc.boards[S().doc.currentBoard]
  expect(board.overrides?.rect?.width).toEqual({ n: 10, unit: "%" })
  expect(S().defaults.nodes.rect.width).toEqual({ n: 30, unit: "%" })
  // new rects on this artboard use the override
  S().setFocus(board.root)
  run("modal.close", 1)
  run("insert.rect", 1)
  expect(S().doc.nodes[S().focus].props.width).toEqual({ n: 10, unit: "%" })
  // restore
  await execCmd("defaults rect")
  run("modal.reset", 1)
  run("modal.scope", 1)
  run("modal.reset", 1)
  run("modal.close", 1)
})

test("defaults filter spans sections", async () => {
  await execCmd("defaults")
  run("modal.filter", 1)
  expect(S().mode).toBe("modal-text")
  type("grid")
  const keys = defaultsView().map(r => r.key)
  expect(keys).toContain("gridSize")
  run("modal.text.commit", 1)
  expect(S().mode).toBe("modal")
  run("modal.text.cancel", 1)
  run("modal.close", 1)
})

test("keymap editor: add and remove bindings", async () => {
  await execCmd("keys")
  expect(keysView().some(r => r.lhs === "u" && r.target === "history.undo")).toBe(true)
  run("modal.input", 1)
  type("Z history.undo")
  run("modal.text.commit", 1)
  expect(S().keymapOverride.bindings.normal.Z).toBe("history.undo")
  expect(keysView().find(r => r.lhs === "Z")?.source).toBe("user")
  run("modal.reset", 1) // row 0 is not Z necessarily
  run("modal.close", 1)
})

test("component loader and icon picker insert nodes", async () => {
  const root = S().doc.boards[S().doc.currentBoard].root
  S().setFocus(root)
  run("insert.rect", 1)
  await execCmd("comp save Thing")
  S().setFocus(root)
  const kids = S().doc.nodes[root].children.length
  run("component.loader", 1)
  expect(S().mode).toBe("modal-text")
  type("thi")
  expect(loaderView()).toEqual(["Thing"])
  run("modal.text.commit", 1)
  expect(S().mode).toBe("normal")
  expect(S().doc.nodes[root].children.length).toBe(kids + 1)
  run("icon.picker", 1)
  type("chevron")
  expect(iconsView().length).toBeGreaterThan(2)
  run("modal.right", 1)
  run("modal.text.commit", 1)
  expect(S().doc.nodes[S().focus].icon).toMatch(/^chevron/)
  expect(S().doc.nodes[S().focus].kind).toBe("icon")
})

test("help shortcuts come from the effective keymap", async () => {
  expect(helpShortcuts().get("history.undo")).toBe("u")
  await execCmd("map normal Z history.undo")
  expect(S().keymapOverride.bindings.normal.Z).toBe("history.undo")
  run("help.open", 1)
  expect(S().modal.kind).toBe("help")
  run("modal.close", 1)
})
