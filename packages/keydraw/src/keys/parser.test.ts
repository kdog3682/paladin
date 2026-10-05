import { describe, expect, test } from "bun:test"
import { defaultKeymap, effectiveKeymap, emptyOverride } from "./keymap.default"
import { eventToKey, normalizeKey, parseSeq } from "./notation"
import { createParser, type ParseResult } from "./parser"
import { buildScopeTrie } from "./trie"

const normal = buildScopeTrie(defaultKeymap, "normal")
const search = buildScopeTrie(defaultKeymap, "normal", "search")
const input = buildScopeTrie(defaultKeymap, "input")

function run(keys: string[], trie = normal, counts = true): ParseResult[] {
  const p = createParser()
  return keys.flatMap(k => p.feed(trie, k, { counts }))
}

const commands = (rs: ParseResult[]) =>
  rs.filter(r => r.type === "command").map(r => (r.type === "command" ? [r.id, r.count] : null))

describe("notation", () => {
  test("normalizes modifiers and names", () => {
    expect(parseSeq("<S-A-up>")).toEqual(["<A-S-Up>"])
    expect(parseSeq("gg")).toEqual(["g", "g"])
    expect(parseSeq("3<S-Down>")).toEqual(["3", "<S-Down>"])
    expect(parseSeq("v-")).toEqual(["v", "-"])
    expect(parseSeq("<lt>")).toEqual(["<"])
    expect(normalizeKey("S-a")).toBe("A")
    expect(normalizeKey("A-L")).toBe("<A-l>")
    expect(normalizeKey("A--")).toBe("<A-->")
  })

  test("events", () => {
    const base = { ctrlKey: false, altKey: false, metaKey: false, shiftKey: false }
    expect(eventToKey({ ...base, key: "a", code: "KeyA" })).toBe("a")
    expect(eventToKey({ ...base, key: "?", code: "Slash", shiftKey: true })).toBe("?")
    expect(eventToKey({ ...base, key: "ArrowUp", code: "ArrowUp", shiftKey: true })).toBe("<S-Up>")
    // macOS Alt+l produces "¬"; matched on code
    expect(eventToKey({ ...base, key: "¬", code: "KeyL", altKey: true })).toBe("<A-l>")
    expect(eventToKey({ ...base, key: "Ò", code: "KeyL", altKey: true, shiftKey: true })).toBe("<A-S-l>")
    expect(eventToKey({ ...base, key: " ", code: "Space", shiftKey: true })).toBe("<S-Space>")
    expect(eventToKey({ ...base, key: "Shift", code: "ShiftLeft", shiftKey: true })).toBeNull()
  })
})

describe("parser", () => {
  test("single keys and sequences", () => {
    expect(commands(run(["<Down>"]))).toEqual([["focus.next", null]])
    expect(commands(run(["g", "g"]))).toEqual([["focus.first", null]])
    expect(commands(run(["v", "-"]))).toEqual([["select.shrink", null]])
  })

  test("counts", () => {
    expect(commands(run(["3", "<Down>"]))).toEqual([["focus.next", 3]])
    expect(commands(run(["1", "2", "w"]))).toEqual([["focus.readNext", 12]])
  })

  test("pending prefixes", () => {
    const rs = run(["g"])
    expect(rs).toEqual([{ type: "pending", keys: ["g"], count: null, ambiguous: false }])
  })

  test("ambiguous y vs ys", () => {
    const p = createParser()
    expect(p.feed(normal, "y")).toEqual([{ type: "pending", keys: ["y"], count: null, ambiguous: true }])
    expect(commands(p.feed(normal, "s"))).toEqual([["style.yank", null]])
    p.feed(normal, "y")
    expect(commands(p.flush(normal))).toEqual([["edit.yank", null]])
  })

  test("ambiguous prefix resolves when the next key doesn't continue it", () => {
    expect(commands(run(["y", "x"]))).toEqual([
      ["edit.yank", null],
      ["edit.delete", null],
    ])
  })

  test("unmatched keys come back as none", () => {
    expect(run(["g", "q"])).toEqual([
      { type: "pending", keys: ["g"], count: null, ambiguous: false },
      { type: "none", keys: ["g", "q"] },
    ])
  })

  test("aliases expand once", () => {
    expect(commands(run([";"]))).toEqual([["mode.command", null]])
  })

  test("state-scoped alias: 3 is # only while search is active", () => {
    expect(commands(run(["3"], search))).toEqual([["search.prev", null]])
    expect(run(["3"], normal)).toEqual([{ type: "pending", keys: [], count: 3, ambiguous: false }])
  })

  test("typing contexts don't take counts", () => {
    expect(run(["2"], input, false)).toEqual([{ type: "none", keys: ["2"] }])
    expect(commands(run(["<Enter>"], input, false))).toEqual([["input.commit", null]])
  })

  test("user overrides replace and remove defaults", () => {
    const km = effectiveKeymap({
      bindings: { normal: { x: null, Q: "edit.delete" } },
      aliases: {},
    })
    const t = buildScopeTrie(km, "normal")
    expect(run(["x"], t)).toEqual([{ type: "none", keys: ["x"] }])
    expect(commands(run(["Q"], t))).toEqual([["edit.delete", null]])
    expect(effectiveKeymap(emptyOverride).bindings.normal.x).toBe("edit.delete")
  })
})
