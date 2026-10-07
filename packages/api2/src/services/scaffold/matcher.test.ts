import { describe, expect, test } from "bun:test"
import { matches, matchesAny } from "./matcher"

describe("matches", () => {
  test("any glob matching is enough", () => {
    expect(matches(["**/*.test.ts", "**/App.tsx"], "/p/src/a.test.ts")).toBe(true)
    expect(matches(["**/*.test.ts", "**/App.tsx"], "/p/src/App.tsx")).toBe(true)
    expect(matches(["**/*.test.ts", "**/App.tsx"], "/p/src/a.ts")).toBe(false)
  })

  test("a basename glob matches the whole file name, not a suffix", () => {
    expect(matches(["**/App.tsx"], "/p/demo/App.tsx")).toBe(true)
    expect(matches(["**/App.tsx"], "/p/src/MyApp.tsx")).toBe(false)
    expect(matches(["**/App.tsx"], "/p/src/App.tsx.bak")).toBe(false)
  })

  test("braces and directory globs", () => {
    expect(matches(["**/{script,scripts}/**/*.ts"], "/p/scripts/push-git-repos.ts")).toBe(true)
    expect(matches(["**/{script,scripts}/**/*.ts"], "/p/src/push-git-repos.ts")).toBe(false)
  })

  test("an empty list matches nothing", () => {
    expect(matches([], "/p/a.test.ts")).toBe(false)
  })
})

describe("matchesAny", () => {
  test("true when one matcher claims the path", () => {
    const matchers = [["**/*.test.ts"], ["**/App.tsx"]]
    expect(matchesAny(matchers, "/p/src/App.tsx")).toBe(true)
    expect(matchesAny(matchers, "/p/src/a.test.ts")).toBe(true)
    expect(matchesAny(matchers, "/p/src/a.ts")).toBe(false)
  })
})
