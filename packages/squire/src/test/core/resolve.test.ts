// @paladin/squire/src/test/core/resolve.test.ts

import { describe, expect, test, beforeAll, afterAll } from "bun:test"
import { join } from "path"
import { mkdirSync, rmSync } from "fs"
import { resolveCurrentPkg } from "../../core/resolve"

const TMP = join(import.meta.dir, ".tmp-resolve-test")
const ROOT = join(TMP, "repo")
const PKG_DIR = join(ROOT, "packages", "ui")

beforeAll(async () => {
  mkdirSync(PKG_DIR, { recursive: true })
  await Bun.write(join(ROOT, "package.json"), JSON.stringify({ name: "root" }))
  await Bun.write(join(PKG_DIR, "package.json"), JSON.stringify({ name: "@paladin/ui" }))
})

afterAll(() => {
  rmSync(TMP, { recursive: true, force: true })
})

describe("resolveCurrentPkg", () => {
  test("finds package from package dir", async () => {
    const result = await resolveCurrentPkg(PKG_DIR, ROOT)
    expect(result.kind).toBe("found")
    if (result.kind === "found") {
      expect(result.pkg).toBe("ui")
      expect(result.pkgDir).toBe(PKG_DIR)
    }
  })

  test("finds package from nested file path", async () => {
    const nested = join(PKG_DIR, "src", "deep")
    mkdirSync(nested, { recursive: true })
    const result = await resolveCurrentPkg(nested, ROOT)
    expect(result.kind).toBe("found")
    if (result.kind === "found") {
      expect(result.pkg).toBe("ui")
    }
  })

  test("returns root when at repo root", async () => {
    const result = await resolveCurrentPkg(ROOT, ROOT)
    expect(result.kind).toBe("root")
  })
})
