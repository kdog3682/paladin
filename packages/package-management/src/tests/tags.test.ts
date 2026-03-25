// @paladin/package-management/tests/tags.test.ts

import { describe, it, expect } from "bun:test"
import { buildTagName, parseTag } from "../lib/tags"
import { bumpMinorVersion } from "../lib/scaffold"

describe("buildTagName", () => {
  it("builds correct tag format", () => {
    expect(buildTagName("@acme/abc", 1)).toBe("deprecated/@acme/abc/v1")
    expect(buildTagName("@acme/abc", 12)).toBe("deprecated/@acme/abc/v12")
  })
})

describe("parseTag", () => {
  it("parses a valid tag", () => {
    const result = parseTag("deprecated/@acme/abc/v3")
    expect(result).toEqual({
      name: "@acme/abc",
      packageName: "@acme/abc",
      version: 3,
      raw: "deprecated/@acme/abc/v3",
    })
  })

  it("returns null for invalid tags", () => {
    expect(parseTag("some-random-tag")).toBeNull()
    expect(parseTag("deprecated/abc")).toBeNull()
  })

  it("sorts numerically not lexicographically (v10 > v9)", () => {
    const v9 = parseTag("deprecated/@acme/abc/v9")!
    const v10 = parseTag("deprecated/@acme/abc/v10")!
    expect(v10.version).toBeGreaterThan(v9.version)
  })
})

describe("bumpMinorVersion", () => {
  it("bumps minor and resets patch", () => {
    expect(bumpMinorVersion("1.0.0")).toBe("1.1.0")
    expect(bumpMinorVersion("0.3.7")).toBe("0.4.0")
  })

  it("handles two-segment versions", () => {
    expect(bumpMinorVersion("1.0")).toBe("1.1")
  })

  it("handles malformed input gracefully", () => {
    expect(bumpMinorVersion("broken")).toBe("0.2.0")
  })
})
