import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { MissingVarError, pack, unpack } from "./bundle"

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "bundle-"))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe("pack", () => {
  test("emits a header per file", () => {
    const s = pack({ "src/a.ts": "const a = 1" })
    expect(s).toBe("/** src/a.ts **/\nconst a = 1\n")
  })

  test("emits a yaml preamble when given meta", () => {
    const s = pack({ "a.txt": "hi" }, undefined, { root: "/tmp" })
    expect(s.startsWith("/*\nroot: /tmp\n*/\n")).toBe(true)
  })

  test("accepts an array of entries", () => {
    const s = pack([{ path: "a.txt", content: "hi" }])
    expect(s).toContain("/** a.txt **/")
  })

  test("reads filepaths relative to the meta root", async () => {
    await Bun.write(join(dir, "src/a.ts"), "const a = 1\n")
    const s = pack([join(dir, "src/a.ts")], undefined, { root: dir })
    expect(unpack(s).files).toEqual([{ path: "src/a.ts", content: "const a = 1\n" }])
  })

  test("leaves placeholders alone with no vars", () => {
    expect(pack({ "a.txt": "port = {{PORT}}" })).toContain("port = {{PORT}}")
  })

  test("substitutes vars and coerces to string", () => {
    expect(pack({ "a.txt": "port = {{PORT}}" }, { PORT: 8080 })).toContain("port = 8080")
  })

  test("uses the fallback when the key is absent", () => {
    expect(pack({ "a.txt": "{{PORT | 3000}}" }, { OTHER: "x" })).toContain("3000")
  })

  test("prefers the value over the fallback", () => {
    expect(pack({ "a.txt": "{{NAME | anon}}" }, { NAME: "pilot" })).toContain("pilot")
  })

  test("throws when there is no value and no fallback", () => {
    expect(() => pack({ "a.txt": "{{NOPE}}" }, { OTHER: "x" })).toThrow(MissingVarError)
  })
})

describe("unpack", () => {
  test("round-trips through pack", () => {
    const files = { "src/a.ts": "const a = 1\n", "src/b.json": '{ "ok": true }\n' }
    const out = unpack(pack(files))
    expect(out.files).toEqual([
      { path: "src/a.ts", content: "const a = 1\n" },
      { path: "src/b.json", content: '{ "ok": true }\n' },
    ])
  })

  test("parses the yaml preamble", () => {
    const out = unpack("/*\nroot: /tmp\nname: pilot\n*/\n\n/** a.txt **/\nhi\n")
    expect(out.yaml).toEqual({ root: "/tmp", name: "pilot" })
    expect(out.files).toHaveLength(1)
  })

  test("returns empty yaml when there is no preamble", () => {
    expect(unpack("/** a.txt **/\nhi\n").yaml).toEqual({})
  })

  test("keeps blank lines inside a file", () => {
    const out = unpack("/** a.ts **/\nconst a = 1\n\nconst b = 2\n")
    expect(out.files[0].content).toBe("const a = 1\n\nconst b = 2\n")
  })

  test("handles an empty file body", () => {
    const out = unpack("/** empty.txt **/\n\n/** a.txt **/\nhi\n")
    expect(out.files[0]).toEqual({ path: "empty.txt", content: "" })
  })

  test("fills placeholders in paths and content", () => {
    const out = unpack('/** src/{{NAME}}.ts **/\nexport const n = "{{NAME}}"\n', { NAME: "pilot" })
    expect(out.files[0].path).toBe("src/pilot.ts")
    expect(out.files[0].content).toBe('export const n = "pilot"\n')
  })

  test("reads from a path", async () => {
    const file = join(dir, "fixture.txt")
    await Bun.write(file, "/** a.txt **/\nhi\n")
    expect(unpack(file).files[0].content).toBe("hi\n")
  })
})

describe("createProject", () => {
  test("writes nested files under the opts root", async () => {
    const s = pack({ "src/a.ts": "const a = 1\n", "pkg/b.json": "{}\n" })
    const out = await createProject(s, { root: dir })

    expect(out.root).toBe(dir)
    expect(out.files).toHaveLength(2)
    expect(readFileSync(join(dir, "src/a.ts"), "utf8")).toBe("const a = 1\n")
    expect(readFileSync(join(dir, "pkg/b.json"), "utf8")).toBe("{}\n")
  })

  test("falls back to the yaml root", async () => {
    const s = pack({ "a.txt": "hi\n" }, undefined, { root: dir })
    const out = await createProject(s)
    expect(out.root).toBe(dir)
    expect(readFileSync(join(dir, "a.txt"), "utf8")).toBe("hi\n")
  })

  test("opts root overrides the yaml root", async () => {
    const s = pack({ "a.txt": "hi\n" }, undefined, { root: "/nowhere" })
    const out = await createProject(s, { root: dir })
    expect(out.root).toBe(dir)
  })

  test("applies vars", async () => {
    const s = "/** {{NAME}}.txt **/\nhello {{NAME}}\n"
    await createProject(s, { root: dir, vars: { NAME: "pilot" } })
    expect(readFileSync(join(dir, "pilot.txt"), "utf8")).toBe("hello pilot\n")
  })

  test("overwrites by default", async () => {
    await Bun.write(join(dir, "a.txt"), "old\n")
    await createProject(pack({ "a.txt": "new\n" }), { root: dir })
    expect(readFileSync(join(dir, "a.txt"), "utf8")).toBe("new\n")
  })

  test("throws on an existing file when overwrite is false", async () => {
    await Bun.write(join(dir, "a.txt"), "old\n")
    const s = pack({ "a.txt": "new\n" })
    expect(createProject(s, { root: dir, overwrite: false })).rejects.toThrow("already exists")
    expect(readFileSync(join(dir, "a.txt"), "utf8")).toBe("old\n")
  })

  test("rejects paths that escape the root", async () => {
    const s = "/** ../escape.txt **/\nnope\n"
    expect(createProject(s, { root: dir })).rejects.toThrow("escapes root")
  })

  test("rejects installNodeModules without a package.json", async () => {
    const s = pack({ "a.txt": "hi\n" })
    expect(createProject(s, { root: dir, installNodeModules: true })).rejects.toThrow("package.json")
  })
})
