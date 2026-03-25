// @paladin/package-management/tests/profiles.test.ts

import { describe, it, expect } from "bun:test"
import { inferProfile, inferProfileFromPaths } from "../lib/profiles"
import type { SnapshotFile } from "../lib/snapshot"

function file(path: string, content = ""): SnapshotFile {
  return { path, content }
}

describe("inferProfile", () => {
  it("detects vite from vite.config.ts", () => {
    const files = [file("packages/ui/vite.config.ts"), file("packages/ui/src/index.ts")]
    expect(inferProfile(files)).toBe("vite")
  })

  it("detects nextjs from next.config.mjs", () => {
    const files = [file("apps/web/next.config.mjs"), file("apps/web/src/page.tsx")]
    expect(inferProfile(files)).toBe("nextjs")
  })

  it("detects astro from astro.config.mjs", () => {
    const files = [file("packages/docs/astro.config.mjs")]
    expect(inferProfile(files)).toBe("astro")
  })

  it("detects chrome-ext from manifest.json with manifest_version", () => {
    const files = [
      file("packages/ext/manifest.json", JSON.stringify({ manifest_version: 3, name: "test" })),
    ]
    expect(inferProfile(files)).toBe("chrome-ext")
  })

  it("ignores manifest.json without manifest_version", () => {
    const files = [
      file("packages/ext/manifest.json", JSON.stringify({ name: "test" })),
    ]
    expect(inferProfile(files)).toBe("typescript")
  })

  it("falls back to typescript when nothing matches", () => {
    const files = [file("packages/lib/src/index.ts"), file("packages/lib/tsconfig.json")]
    expect(inferProfile(files)).toBe("typescript")
  })
})

describe("inferProfileFromPaths", () => {
  it("detects vite from path alone", () => {
    expect(inferProfileFromPaths(["vite.config.ts", "src/main.ts"])).toBe("vite")
  })

  it("falls back to typescript", () => {
    expect(inferProfileFromPaths(["src/index.ts"])).toBe("typescript")
  })
})
