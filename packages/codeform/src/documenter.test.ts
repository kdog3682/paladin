// @paladin/packages/codeform/documenter.test.ts

import { describe, it, expect, beforeAll, afterAll } from "bun:test"
import { mkdtemp, writeFile, rm } from "fs/promises"
import { join } from "path"
import { tmpdir } from "os"
import { document } from "./documenter"
import { format } from "./formatter"
import { FileCache } from "./cache"
import type { FileDoc } from "./documenter.types"

const MATH = `
/** Add two numbers */
export function add(a: number, b: number): number {
  return a + b
}

/** Multiply two numbers */
export async function multiply(x: number, y: number): Promise<number> {
  return x * y
}

/** Internal helper */
function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max)
}

/** Precision constant */
export const PRECISION = 6
`

let dir: string

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "codeform-documenter-"))
  await writeFile(join(dir, "math.ts"), MATH)
})

afterAll(async () => {
  await rm(dir, { recursive: true })
})

function makeCache() {
  return new FileCache<FileDoc>("/dev/null")
}

describe("documenter", () => {
  it("parses a single file", async () => {
    const cache = makeCache()
    const result = await document(dir, [join(dir, "math.ts")], cache)

    expect(result.files).toHaveLength(1)
    expect(result.files[0]).toMatchSnapshot()
  })

  it("builds index from exported symbols", async () => {
    const cache = makeCache()
    const result = await document(dir, [join(dir, "math.ts")], cache)

    expect(result.index).toMatchSnapshot()
  })

  it("formats a single file", async () => {
    const cache = makeCache()
    const result = await document(dir, [join(dir, "math.ts")], cache)
    const spec = format(result)

    expect(spec).toMatchSnapshot()
  })
})
