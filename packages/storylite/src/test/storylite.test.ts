import { describe, expect, test } from "bun:test"
import { join } from "node:path"
import { expect as check, fn } from "../client/expect"
import { humanize } from "../client/model"
import { exportOrder, findStories, plan, titleOf } from "../find"

const fixtures = join(import.meta.dir, "fixtures")
const cli = join(import.meta.dir, "..", "cli.ts")

describe("finding stories", () => {
  test("a directory yields every .stories. file under it, sorted", () => {
    const found = findStories(fixtures).map((f) => f.slice(fixtures.length + 1))
    expect(found).toEqual(["fail/Broken.stories.tsx", "pass/Counter.stories.tsx"])
  })

  test("a file is itself", () => {
    const file = join(fixtures, "pass/Counter.stories.tsx")
    expect(findStories(file)).toEqual([file])
  })

  test("export order is the order written, not alphabetical", () => {
    expect(exportOrder(join(fixtures, "pass/Counter.stories.tsx"))).toEqual(["Default", "StartsAtFive", "Increments", "shorthand", "Steps"])
  })

  test("title comes from the path", () => {
    expect(titleOf("/p/src/components/Button.stories.tsx", "/p")).toBe("components/Button")
    expect(titleOf("/p/Button.stories.ts", "/p")).toBe("Button")
  })

  test("humanize", () => {
    expect(humanize("withIcon")).toBe("With Icon")
    expect(humanize("with_icon")).toBe("With icon")
    expect(humanize("Primary")).toBe("Primary")
  })

  test("a non-stories file is refused", () => {
    expect(() => plan(join(fixtures, "pass/Counter.tsx"))).toThrow("not a .stories. file")
  })
})

describe("expect", () => {
  test("matchers pass and fail with a readable message", () => {
    check(1).toBe(1)
    check({ a: [1, 2] }).toEqual({ a: [1, 2] })
    check([1, 2]).toContain(2)
    check(1).not.toBe(2)
    expect(() => check("a").toBe("b")).toThrow('expected "a" to be "b"')
    expect(() => check(1).not.toBe(1)).toThrow("not to be 1")
  })

  test("an unknown matcher is an error, not a silent pass", () => {
    expect(() => (check(1) as any).toBeBanana()).toThrow("not a matcher")
  })

  test("fn records calls", () => {
    const spy = fn((n: number) => n * 2)
    expect(spy(2)).toBe(4)
    check(spy).toHaveBeenCalledTimes(1)
    check(spy).toHaveBeenCalledWith(2)
    expect(() => check(spy).toHaveBeenCalledWith(3)).toThrow("have been called with")
    expect(() => check(() => {}).toHaveBeenCalled()).toThrow("mock fn")
  })
})

describe("storylite --test", () => {
  const run = (target: string) => Bun.spawnSync(["bun", cli, target, "--test"], { stdout: "pipe", stderr: "pipe" })

  test("passing stories exit 0", () => {
    const out = run(join(fixtures, "pass"))
    const text = out.stdout.toString()
    expect(out.exitCode).toBe(0)
    expect(text).toContain("✓ Increments")
    expect(text).toContain("✓ Steps")
    expect(text).toContain("5 passed, 0 failed")
  }, 90_000)

  test("a failing assertion and a throwing render exit 1 and say why", () => {
    const out = run(join(fixtures, "fail"))
    const text = out.stdout.toString()
    expect(out.exitCode).toBe(1)
    expect(text).toContain('✗ Wrong Text')
    expect(text).toContain('to have text nope (got "Count: 0")')
    expect(text).toContain("✗ Throws")
    expect(text).toContain("boom")
    expect(text).toContain("✗ text button equals \"Count: 9\"  — this is wrong on purpose")
    expect(text).toContain("· click button")
    expect(text).toContain("1 passed, 3 failed")
  }, 90_000)
})
