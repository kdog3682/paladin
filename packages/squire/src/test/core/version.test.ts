// @paladin/squire/src/test/core/version.test.ts

import { describe, expect, test } from "bun:test"
import {
  parseWipMessage,
  latestVersion,
  buildCommitMessage,
  nextCommitMessage,
  type VersionInfo,
} from "../../core/version"

describe("parseWipMessage", () => {
  test("parses version with message", () => {
    const result = parseWipMessage("wip(utils): v3 -- added helpers")
    expect(result).toEqual({ pkg: "utils", version: 3, message: "added helpers" })
  })

  test("parses version without message", () => {
    const result = parseWipMessage("wip(core): v1")
    expect(result).toEqual({ pkg: "core", version: 1, message: undefined })
  })

  test("returns null for non-wip messages", () => {
    expect(parseWipMessage("fix: typo")).toBeNull()
    expect(parseWipMessage("wip(broken")).toBeNull()
    expect(parseWipMessage("")).toBeNull()
  })

  test("handles scoped package names", () => {
    const result = parseWipMessage("wip(my-pkg): v12 -- big refactor")
    expect(result).toEqual({ pkg: "my-pkg", version: 12, message: "big refactor" })
  })
})

describe("latestVersion", () => {
  test("returns 0 for empty array", () => {
    expect(latestVersion([])).toBe(0)
  })

  test("finds the max version", () => {
    const entries: VersionInfo[] = [
      { pkg: "a", version: 2 },
      { pkg: "a", version: 5 },
      { pkg: "a", version: 3 },
    ]
    expect(latestVersion(entries)).toBe(5)
  })
})

describe("buildCommitMessage", () => {
  test("without message", () => {
    expect(buildCommitMessage("ui", 4)).toBe("wip(ui): v4")
  })

  test("with message", () => {
    expect(buildCommitMessage("ui", 4, "layout fix")).toBe("wip(ui): v4 -- layout fix")
  })
})

describe("nextCommitMessage", () => {
  test("starts at v1 with no history", () => {
    expect(nextCommitMessage([], "core")).toBe("wip(core): v1")
  })

  test("increments from existing history", () => {
    const history: VersionInfo[] = [
      { pkg: "core", version: 1 },
      { pkg: "core", version: 2 },
      { pkg: "other", version: 10 },
    ]
    expect(nextCommitMessage(history, "core", "next")).toBe("wip(core): v3 -- next")
  })

  test("ignores other packages", () => {
    const history: VersionInfo[] = [
      { pkg: "other", version: 99 },
    ]
    expect(nextCommitMessage(history, "core")).toBe("wip(core): v1")
  })
})
