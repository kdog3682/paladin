// @paladin/packages/codeform/documenter.test.ts

import { describe, it, expect } from "bun:test"
import { resolve } from "path"
import { readFile, stat } from "fs/promises"
import { document } from "./documenter"
import { format } from "./formatter"
import { FileCache } from "./cache"
import type { FileDoc } from "./documenter.types"

const root = resolve("~/projects/paladin/packages/conversation")
const bash = resolve(root, "src/bash.ts")
const src = resolve(root, "src")

function makeCache() {
  return new FileCache<FileDoc>("/dev/null")
}

describe("documenter", () => {
  it("parses a single file", async () => {
    const cache = makeCache()
    const result = await document(root, [bash], cache)

    expect(result.files).toHaveLength(1)
    expect(result.files[0]).toMatchSnapshot()
  })

  it("formats a single file", async () => {
    const cache = makeCache()
    const result = await document(root, [bash], cache)
    const spec = format(result)

    expect(spec).toMatchSnapshot()
  })
})

describe("directory", () => {
  it("documents src directory", async () => {
    const cache = makeCache()
    const { stdout } = await Bun.$`grep -rl "/\*\*" ${src} --include="*.ts"`.quiet()
    const targets = stdout.toString().trim().split("\n").filter(Boolean)
    const result = await document(root, targets, cache)

    expect(result.files.length).toBeGreaterThan(0)
    expect(result).toMatchSnapshot()
  })

  it("formats src directory", async () => {
    const cache = makeCache()
    const { stdout } = await Bun.$`grep -rl "/\*\*" ${src} --include="*.ts"`.quiet()
    const targets = stdout.toString().trim().split("\n").filter(Boolean)
    const result = await document(root, targets, cache)
    const spec = format(result)

    expect(spec).toMatchSnapshot()
  })
})
