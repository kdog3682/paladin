// @paladin/squire/src/test/core/matcher.test.ts

import { describe, expect, test } from "bun:test"
import { matchTestFiles, findDemoFile } from "../../core/matcher"

const files = [
  "src/index.ts",
  "src/utils.test.ts",
  "src/grid.test.ts",
  "src/layout.test.tsx",
  "src/helpers.ts",
  "src/app.demo.ts",
  "src/readme.md",
]

describe("matchTestFiles", () => {
  test("finds all test files without pattern", () => {
    const result = matchTestFiles(files)
    expect(result).toEqual([
      "src/utils.test.ts",
      "src/grid.test.ts",
      "src/layout.test.tsx",
    ])
  })

  test("filters by pattern", () => {
    const result = matchTestFiles(files, "grid")
    expect(result).toEqual(["src/grid.test.ts"])
  })

  test("pattern is case-insensitive", () => {
    const result = matchTestFiles(files, "UTILS")
    expect(result).toEqual(["src/utils.test.ts"])
  })

  test("returns empty for no matches", () => {
    expect(matchTestFiles(files, "zzz")).toEqual([])
  })

  test("returns empty for no test files", () => {
    expect(matchTestFiles(["src/index.ts"])).toEqual([])
  })
})

describe("findDemoFile", () => {
  test("finds .demo.ts", () => {
    expect(findDemoFile(files)).toBe("src/app.demo.ts")
  })

  test("finds .demo.tsx", () => {
    expect(findDemoFile(["a.demo.tsx"])).toBe("a.demo.tsx")
  })

  test("returns null when none found", () => {
    expect(findDemoFile(["src/index.ts"])).toBeNull()
  })
})
