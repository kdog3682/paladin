// @paladin/conversation-processor/utils/path.test.ts

import { describe, test, expect } from "bun:test"
import { homedir } from "os"
import { resolvePath, extractPackageInfo } from "./path"

const BASE = "/tmp/projects"

describe("resolvePath", () => {
  test("scoped package paths", () => {
    expect(resolvePath("@acme/fcache/src/utils.ts", BASE))
      .toBe("/tmp/projects/acme/packages/fcache/src/utils.ts")

    expect(resolvePath("@acme/web/src/routes/home.ts", BASE))
      .toBe("/tmp/projects/acme/packages/web/src/routes/home.ts")

    expect(resolvePath("@acme/fcache/readme.md", BASE))
      .toBe("/tmp/projects/acme/packages/fcache/src/readme.md")
  })

  test("packages-prefixed and docs paths", () => {
    expect(resolvePath("@acme/packages/fcache/utils.ts", BASE))
      .toBe("/tmp/projects/acme/packages/fcache/src/utils.ts")

    expect(resolvePath("@acme/packages/fcache/src/utils.ts", BASE))
      .toBe("/tmp/projects/acme/packages/fcache/src/utils.ts")

    expect(resolvePath("@acme/docs/notes.md", BASE))
      .toBe("/tmp/projects/acme/docs/notes.md")
  })

  test("package root config paths are kept at package root", () => {
    expect(resolvePath("@acme/fcache/tsconfig.json", BASE))
      .toBe("/tmp/projects/acme/packages/fcache/tsconfig.json")

    expect(resolvePath("@acme/packages/fcache/vite.config.ts", BASE))
      .toBe("/tmp/projects/acme/packages/fcache/vite.config.ts")
  })

  test("root-level files", () => {
    expect(resolvePath("@acme/readme.md", BASE))
      .toBe("/tmp/projects/acme/readme.md")

    expect(resolvePath("@acme/tsconfig.json", BASE))
      .toBe("/tmp/projects/acme/tsconfig.json")
  })

  test("paths that lack a file resolve to null", () => {
    expect(resolvePath("@acme", BASE)).toBeNull()
    expect(resolvePath("@acme/", BASE)).toBeNull()
    expect(resolvePath("@acme/foobar", BASE)).toBeNull()
  })

  test("relative paths throw an error", () => {
    expect(() => resolvePath("./local/file.ts", BASE))
      .toThrow("relative paths not allowed: ./local/file.ts")
  })

  test("absolute paths pass through unchanged", () => {
    expect(resolvePath("/home/user/file.ts", BASE))
      .toBe("/home/user/file.ts")
  })

  test("home-relative paths expand the tilde", () => {
    const result = resolvePath("~/docs/notes.md", BASE)
    expect(result).toBe(`${homedir()}/docs/notes.md`)
  })
})

describe("extractPackageInfo", () => {
  const root = "/tmp/projects/acme"

  test("package files", () => {
    expect(extractPackageInfo("/tmp/projects/acme/packages/fcache/src/utils.ts", root))
      .toEqual({ packageName: "fcache", filePath: "src/utils.ts" })

    expect(extractPackageInfo("/tmp/projects/acme/packages/web/index.ts", root))
      .toEqual({ packageName: "web", filePath: "index.ts" })
  })

  test("root files return null", () => {
    expect(extractPackageInfo("/tmp/projects/acme/readme.md", root)).toBeNull()
    expect(extractPackageInfo("/tmp/projects/acme/tsconfig.json", root)).toBeNull()
  })
})
