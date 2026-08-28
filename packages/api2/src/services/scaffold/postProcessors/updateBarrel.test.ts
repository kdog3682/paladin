import { describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { updateBarrel } from "./updateBarrel"
import type { File, Unit } from "../types"

function root(): string {
  return mkdtempSync(join(tmpdir(), "updateBarrel-"))
}

function file(path: string, status: File["status"] = "created"): File {
  return { path, status, action: "write", content: "" }
}

describe("updateBarrel", () => {
  test("adds an export line for a newly created src file", async () => {
    const dir = root()
    const unit: Unit = { name: "acme", dir, isNew: true, files: [file(join(dir, "src", "foo.ts"))] }

    const result = await updateBarrel(unit)

    const barrel = join(dir, "src", "index.ts")
    expect(readFileSync(barrel, "utf8")).toBe('export * from "./foo"\n')
    expect(result).toEqual({ name: "updateBarrel", paths: [barrel] })
  })

  test("appends onto an existing barrel", async () => {
    const dir = root()
    mkdirSync(join(dir, "src"), { recursive: true })
    writeFileSync(join(dir, "src", "index.ts"), 'export * from "./bar"\n')

    const unit: Unit = { name: "acme", dir, isNew: false, files: [file(join(dir, "src", "foo.ts"))] }

    await updateBarrel(unit)

    const barrel = join(dir, "src", "index.ts")
    expect(readFileSync(barrel, "utf8")).toBe('export * from "./bar"\nexport * from "./foo"\n')
  })

  test("skips files that aren't newly created, aren't under src, or are runnable/test files", async () => {
    const dir = root()
    const unit: Unit = {
      name: "acme",
      dir,
      isNew: true,
      files: [
        file(join(dir, "src", "foo.ts"), "unchanged"),
        file(join(dir, "scripts", "bar.ts")),
        file(join(dir, "src", "foo.test.ts")),
        file(join(dir, "src", "test", "helper.ts")),
      ],
    }

    const result = await updateBarrel(unit)

    expect(result).toEqual({ name: "updateBarrel", paths: [] })
  })
})
