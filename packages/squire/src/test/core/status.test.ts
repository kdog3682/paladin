// @paladin/squire/src/test/core/status.test.ts

import { describe, expect, test } from "bun:test"
import { buildStatus } from "../../core/status"
import type { VersionInfo } from "../../core/version"

describe("buildStatus", () => {
  test("computes status from history", () => {
    const history: VersionInfo[] = [
      { pkg: "ui", version: 1 },
      { pkg: "ui", version: 3 },
      { pkg: "other", version: 10 },
    ]
    const result = buildStatus("ui", "/repo/packages/ui", history, {
      demo: true,
      test: false,
    }, ["src/foo.ts"])

    expect(result.pkg).toBe("ui")
    expect(result.latestVersion).toBe(3)
    expect(result.watchState.demo).toBe(true)
    expect(result.watchState.test).toBe(false)
    expect(result.dirtyFiles).toEqual(["src/foo.ts"])
  })

  test("returns version 0 with no history", () => {
    const result = buildStatus("new-pkg", "/repo/packages/new-pkg", [], {
      demo: false,
      test: true,
      testPattern: "abc",
    }, [])

    expect(result.latestVersion).toBe(0)
    expect(result.watchState.testPattern).toBe("abc")
    expect(result.dirtyFiles).toEqual([])
  })
})
