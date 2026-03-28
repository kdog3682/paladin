// @paladin/squire/src/test/core/search.test.ts

import { describe, expect, test } from "bun:test"
import { findByQuery, findLatestForPkg } from "../../core/search"
import type { VersionInfo } from "../../core/version"

const entries: VersionInfo[] = [
  { pkg: "ui", version: 1, message: "initial layout", hash: "aaa" },
  { pkg: "ui", version: 2, message: "added buttons", hash: "bbb" },
  { pkg: "ui", version: 3, message: "refactored grid", hash: "ccc" },
]

describe("findByQuery", () => {
  test("matches substring case-insensitively", () => {
    const result = findByQuery(entries, "BUTTON")
    expect(result?.version).toBe(2)
  })

  test("returns first match", () => {
    const result = findByQuery(entries, "a")
    expect(result?.version).toBe(1)
  })

  test("returns null when nothing matches", () => {
    expect(findByQuery(entries, "zzz")).toBeNull()
  })

  test("returns null on empty list", () => {
    expect(findByQuery([], "anything")).toBeNull()
  })
})

describe("findLatestForPkg", () => {
  test("returns highest version", () => {
    const result = findLatestForPkg(entries)
    expect(result?.version).toBe(3)
    expect(result?.hash).toBe("ccc")
  })

  test("returns null on empty list", () => {
    expect(findLatestForPkg([])).toBeNull()
  })
})
