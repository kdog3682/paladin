import { describe, expect, test } from "bun:test"
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { deleteShadowedFiles } from "./deleteShadowedFiles"
import type { File, Unit } from "../types"

function root(): string {
  return mkdtempSync(join(tmpdir(), "deleteShadowedFiles-"))
}

function file(path: string, status: File["status"] = "created"): File {
  return { path, status, action: "write", content: "" }
}

describe("deleteShadowedFiles", () => {
  test("deletes a directory shadowed by a new file of the same name", async () => {
    const dir = root()
    mkdirSync(join(dir, "src", "foo"), { recursive: true })
    writeFileSync(join(dir, "src", "foo", "index.ts"), "old")

    const unit: Unit = { name: "acme", dir, isNew: false, files: [file(join(dir, "src", "foo.ts"))] }

    const result = await deleteShadowedFiles(unit)

    expect(existsSync(join(dir, "src", "foo"))).toBe(false)
    expect(result).toEqual({ name: "deleteShadowedFiles", paths: [join(dir, "src", "foo")] })
  })

  test("deletes a sibling file shadowed by a new directory of the same name", async () => {
    const dir = root()
    mkdirSync(join(dir, "src"), { recursive: true })
    writeFileSync(join(dir, "src", "foo.ts"), "old")

    const unit: Unit = { name: "acme", dir, isNew: false, files: [file(join(dir, "src", "foo", "index.ts"))] }

    const result = await deleteShadowedFiles(unit)

    expect(existsSync(join(dir, "src", "foo.ts"))).toBe(false)
    expect(result).toEqual({ name: "deleteShadowedFiles", paths: [join(dir, "src", "foo.ts")] })
  })

  test("leaves a directory alone when the unit still owns files under it", async () => {
    const dir = root()
    mkdirSync(join(dir, "src", "foo"), { recursive: true })
    writeFileSync(join(dir, "src", "foo", "old.ts"), "old")

    const unit: Unit = {
      name: "acme",
      dir,
      isNew: false,
      files: [file(join(dir, "src", "foo.ts")), file(join(dir, "src", "foo", "old.ts"), "unchanged")],
    }

    const result = await deleteShadowedFiles(unit)

    expect(existsSync(join(dir, "src", "foo"))).toBe(true)
    expect(result).toEqual({ name: "deleteShadowedFiles", paths: [] })
  })

  test("returns no paths when nothing on disk is shadowed", async () => {
    const dir = root()
    const unit: Unit = { name: "acme", dir, isNew: true, files: [file(join(dir, "src", "a.ts"))] }

    const result = await deleteShadowedFiles(unit)

    expect(result).toEqual({ name: "deleteShadowedFiles", paths: [] })
  })
})
