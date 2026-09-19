import { describe, expect, test } from "bun:test"
import { kindOf, matches, matchesAny } from "./matcher"

describe("kindOf", () => {
  test("pattern kinds win, then classify()", () => {
    expect(kindOf("/p/src/a.examples.ts")).toBe("example")
    expect(kindOf("/x/packages/recast/src/specs/rename.ts")).toBe("recast-spec")
    expect(kindOf("/x/packages/codemod/src/transforms/rename.ts")).toBe("codemod")
    expect(kindOf("/p/src/a.test.ts")).toBe("test")
    expect(kindOf("/p/src/a.ts")).toBe("source")
  })
})

describe("matches", () => {
  test("kind must equal", () => {
    expect(matches({ kind: "test" }, "/p/a.test.ts")).toBe(true)
    expect(matches({ kind: "demo" }, "/p/a.test.ts")).toBe(false)
  })

  test("ext narrows it when set", () => {
    expect(matches({ kind: "test", ext: "ts" }, "/p/a.test.ts")).toBe(true)
    expect(matches({ kind: "test", ext: "tsx" }, "/p/a.test.ts")).toBe(false)
  })

  test("basename alone matches the file name exactly, whatever its kind", () => {
    expect(matches({ basename: "App.tsx" }, "/p/src/App.tsx")).toBe(true)
    expect(matches({ basename: "App.tsx" }, "/p/demo/App.tsx")).toBe(true)
    expect(matches({ basename: "App.tsx" }, "/p/src/MyApp.tsx")).toBe(false)
    expect(matches({ basename: "App.tsx" }, "/p/src/App.tsx.bak")).toBe(false)
  })

  test("basename narrows a kind when both are set", () => {
    expect(matches({ kind: "test", basename: "a.test.ts" }, "/p/a.test.ts")).toBe(true)
    expect(matches({ kind: "test", basename: "b.test.ts" }, "/p/a.test.ts")).toBe(false)
  })

  test("a matcher with nothing set matches nothing", () => {
    expect(matches({}, "/p/a.test.ts")).toBe(false)
  })

  test("a known kind can be passed in", () => {
    expect(matches({ kind: "demo" }, "/p/a.test.ts", "demo")).toBe(true)
  })
})

describe("matchesAny", () => {
  test("true when one matcher claims the path", () => {
    const matchers = [{ kind: "test" }, { basename: "App.tsx" }]
    expect(matchesAny(matchers, "/p/src/App.tsx")).toBe(true)
    expect(matchesAny(matchers, "/p/src/a.test.ts")).toBe(true)
    expect(matchesAny(matchers, "/p/src/a.ts")).toBe(false)
  })
})
