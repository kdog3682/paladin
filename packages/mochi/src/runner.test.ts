// @paladin/mochi/src/runner.test.ts

import { expect, test, describe } from "bun:test"
import { stamp } from "@paladin/stamp"
import { mochi } from "./runner"

const FIXTURES = `
===
add.mochi.ts
===
export function simple() {
  return 1 + 2
  // 3
}

export function negative() {
  return -1 + -2
  // -3
}

===
hooks.mochi.ts
===
let count = 0

export function beforeEach() {
  count = 0
}

/* starts at zero */
export function startsAtZero() {
  return count
  // 0
}

/* after increment */
export function afterIncrement() {
  count += 10
  return count
  // 10
}

===
throws.mochi.ts
===
/* this one blows up */
export function boom() {
  throw new Error("kaboom")
  // never
}

export function ok() {
  return 42
  // 42
}

===
async.mochi.ts
===
/* async story */
export async function delayed() {
  await new Promise(r => setTimeout(r, 10))
  return "done"
  // done
}
`

const paths = stamp(FIXTURES)

describe("runner", () => {
  test("runs stories and collects results", async () => {
    const [suite] = await mochi([paths[0]])

    expect(suite.results).toHaveLength(2)
    expect(suite.results[0].name).toBe("simple")
    expect(suite.results[0].value).toBe(3)
    expect(suite.results[0].error).toBeNull()
    expect(suite.results[0].duration).toBeGreaterThan(0)

    expect(suite.results[1].name).toBe("negative")
    expect(suite.results[1].value).toBe(-3)
  })

  test("beforeEach resets state between stories", async () => {
    const [suite] = await mochi([paths[1]])

    expect(suite.results).toHaveLength(2)
    expect(suite.results[0].value).toBe(0)
    expect(suite.results[1].value).toBe(10)
  })

  test("captures errors without crashing", async () => {
    const [suite] = await mochi([paths[2]])

    expect(suite.results).toHaveLength(2)

    const boom = suite.results[0]
    expect(boom.name).toBe("boom")
    expect(boom.error).toBeInstanceOf(Error)
    expect(boom.error!.message).toBe("kaboom")
    expect(boom.value).toBeUndefined()

    const ok = suite.results[1]
    expect(ok.value).toBe(42)
    expect(ok.error).toBeNull()
  })

  test("handles async stories", async () => {
    const [suite] = await mochi([paths[3]])

    expect(suite.results[0].value).toBe("done")
    expect(suite.results[0].duration).toBeGreaterThanOrEqual(10)
  })

  test("runs multiple files", async () => {
    const suites = await mochi([paths[0], paths[1]])

    expect(suites).toHaveLength(2)
    expect(suites[0].path).toBe(paths[0])
    expect(suites[1].path).toBe(paths[1])
  })

  test("expected values are preserved on suite", async () => {
    const [suite] = await mochi([paths[0]])

    expect(suite.stories[0].expected).toBe("3")
    expect(suite.stories[1].expected).toBe("-3")
  })
})
