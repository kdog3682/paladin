// @paladin/mochi/src/parser.test.ts

import { expect, test, describe } from "bun:test"
import { stamp } from "@paladin/stamp"
import { parseMochiSource } from "./parser"
import { readFileSync } from "fs"

const FIXTURES = `
===
math.mochi.ts
===
import { add } from "./math"

const big = 1_000_000

/* adds small numbers */
export function smallNums() {
  const a = 1
  const b = 2
  return add(a, b)
  // 3
}

// handles negatives
export function negatives() {
  return add(-3, -2)
  // -5
}

/* big numbers */
export function large() {
  return add(big, big)
  // 2000000
}

===
hooks.mochi.ts
===
let counter = 0

export function beforeEach() {
  counter = 0
}

/* starts fresh */
export function startsAtZero() {
  return counter
  // 0
}

/* increment works */
export function increment() {
  counter += 5
  return counter
  // 5
}

===
multiline-expected.mochi.ts
===
/* returns a complex object */
export function objectResult() {
  return { name: "foo", count: 42 }
  // { name: "foo", count: 42 }
  // { items: [1, 2, 3] }
}

/* block expected */
export function blockExpected() {
  return { status: "ok" }
  /* { status: "ok", value: 99 } */
}
`

const paths = stamp(FIXTURES)

describe("parser", () => {
  test("collects stories from math.mochi.ts", () => {
    const source = readFileSync(paths[0], "utf-8")
    const suite = parseMochiSource(source, paths[0])

    expect(suite.stories).toHaveLength(3)

    expect(suite.stories[0].name).toBe("smallNums")
    expect(suite.stories[0].description).toBe("adds small numbers")
    expect(suite.stories[0].expected).toBe("3")

    expect(suite.stories[1].name).toBe("negatives")
    expect(suite.stories[1].description).toBe("handles negatives")
    expect(suite.stories[1].expected).toBe("-5")

    expect(suite.stories[2].name).toBe("large")
    expect(suite.stories[2].description).toBe("big numbers")
    expect(suite.stories[2].expected).toBe("2000000")
  })

  test("extracts globals", () => {
    const source = readFileSync(paths[0], "utf-8")
    const suite = parseMochiSource(source, paths[0])

    expect(suite.globals).toHaveLength(1)
    expect(suite.globals[0].name).toBe("big")
    expect(suite.globals[0].body).toContain("1_000_000")
  })

  test("detects hooks and excludes from stories", () => {
    const source = readFileSync(paths[1], "utf-8")
    const suite = parseMochiSource(source, paths[1])

    expect(suite.hooks.beforeEach).toBe(true)
    expect(suite.hooks.beforeAll).toBe(false)
    expect(suite.hooks.afterEach).toBe(false)
    expect(suite.hooks.afterAll).toBe(false)

    expect(suite.stories).toHaveLength(2)
    expect(suite.stories.map((s) => s.name)).toEqual(["startsAtZero", "increment"])
  })

  test("handles multiline expected comments", () => {
    const source = readFileSync(paths[2], "utf-8")
    const suite = parseMochiSource(source, paths[2])

    expect(suite.stories[0].name).toBe("objectResult")
    expect(suite.stories[0].expected).toBe(
      '{ name: "foo", count: 42 }\n{ items: [1, 2, 3] }'
    )
  })

  test("handles block comment expected", () => {
    const source = readFileSync(paths[2], "utf-8")
    const suite = parseMochiSource(source, paths[2])

    expect(suite.stories[1].name).toBe("blockExpected")
    expect(suite.stories[1].expected).toBe('{ status: "ok", value: 99 }')
  })

  test("body excludes expected comments", () => {
    const source = readFileSync(paths[0], "utf-8")
    const suite = parseMochiSource(source, paths[0])

    const body = suite.stories[0].body
    expect(body).toContain("return add(a, b)")
    expect(body).not.toContain("// 3")
  })
})
