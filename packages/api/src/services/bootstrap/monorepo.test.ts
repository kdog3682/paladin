// src/services/bootstrap/monorepo.test.ts

import { describe, test, expect, beforeEach, afterEach, mock, spyOn } from "bun:test"
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "fs"
import { join, dirname } from "path"
import { bootstrapMonorepo, scaffold } from "./monorepo"

const TMP = process.env.TMP_DIR

let PROJECT: string

function write(path: string, content: string) {
  const full = join(PROJECT, path)
  mkdirSync(dirname(full), { recursive: true })
  writeFileSync(full, content)
}

function readJson(path: string) {
  return JSON.parse(readFileSync(join(PROJECT, path), "utf-8"))
}

const originalFetch = globalThis.fetch

beforeEach(() => {
  PROJECT = join(TMP, `test-${crypto.randomUUID()}`, 'myapp')
  mkdirSync(PROJECT, { recursive: true })

  globalThis.fetch = mock(async (url: string) => {
    if (typeof url === "string" && url.includes("registry.npmjs.org")) {
      return new Response(JSON.stringify({ version: "1.0.0" }), { status: 200 })
    }
    return originalFetch(url)
  }) as typeof fetch

  spyOn(Bun, "spawn").mockReturnValue({
    exited: Promise.resolve(0),
  } as ReturnType<typeof Bun.spawn>)
})

afterEach(() => {
  globalThis.fetch = originalFetch
  rmSync(PROJECT, { recursive: true, force: true })
})



// ── scaffold ────────────────────────────────────────────────

describe("scaffold", () => {
  test("creates root package.json", async () => {
    const created = await scaffold(PROJECT, "myapp")
    expect(created.length).toBeGreaterThan(0)
    expect(existsSync(join(PROJECT, "package.json"))).toBe(true)
  })

  test("skips root if package.json exists", async () => {
    write("package.json", '{"name":"myapp"}')
    const created = await scaffold(PROJECT, "myapp")
    expect(created).toEqual([])
  })

  test("creates package scaffold", async () => {
    write("packages/web/src/App.tsx", "export default () => <div/>")

    const created = await scaffold(PROJECT, "myapp", "web")
    expect(created.length).toBeGreaterThan(0)
    expect(existsSync(join(PROJECT, "packages/web/package.json"))).toBe(true)
  })

  test("does not overwrite existing files", async () => {
    const path = "packages/web/src/App.tsx"

    write(path, "my custom app")
    const created = await scaffold(PROJECT, "myapp", "web")
    const content = readFileSync(join(PROJECT, path), "utf-8")
    expect(content).toBe("my custom app")
  })

  test("force overwrites existing files", async () => {
    write("package.json", '{"name":"old"}')
    const created = await scaffold(PROJECT, "myapp", undefined, true)

    expect(created.length).toBeGreaterThan(0)
    const pkg = readJson("package.json")
    expect(pkg.name).toBe("myapp")
  })
})

// ── bootstrapMonorepo ───────────────────────────────────────

describe("bootstrapMonorepo", () => {
  test("scaffolds root and discovers packages", async () => {
    write("packages/web/src/App.tsx", 'import React from "react"\nexport default () => <div/>')
    write("packages/api/src/index.ts", 'import express from "express"\nconst app = express()')

    const result = await bootstrapMonorepo(PROJECT)

    expect(result.new).toBe(true)
    expect(result.packages).toHaveLength(2)

    const web = result.packages.find((p) => p.name === "web")
    const api = result.packages.find((p) => p.name === "api")
    expect(web).toBeDefined()
    expect(api).toBeDefined()
  })

  // source files are parsed for bare imports (not relative/absolute paths).
  // each unique package name gets resolved to a version via npmCache
  // and written into the package's dependencies in package.json.
  test("detects imports and adds to package.json", async () => {
    write("packages/web/src/App.tsx", 'import React from "react"\nimport { motion } from "framer-motion"')

    const result = await bootstrapMonorepo(PROJECT)
    const web = result.packages.find((p) => p.name === "web")!

    expect(web.installedDependencies.some((d) => d.name === "react")).toBe(false)
    // because scaffold will detect the project as a vite project
    // react will automatically be installed
    expect(web.installedDependencies.some((d) => d.name === "framer-motion")).toBe(true)

    const pkg = readJson("packages/web/package.json")
    expect(pkg.dependencies.react).toBeDefined()
    expect(pkg.dependencies["framer-motion"]).toBeDefined()
  })

  // if a dep already exists in package.json (regardless of version),
  // it should not be touched or re-resolved. the user's pinned
  // version is preserved, and installedDependencies stays empty.
  // note: we pre-write the package.json here because we need an
  // existing dep to test against — scaffold would create a fresh one.
  test("skips already resolved deps", async () => {
    write("packages/web/package.json", '{"name":"@myapp/web","dependencies":{"react":"^18.0.0"}}')
    write("packages/web/src/App.tsx", 'import React from "react"')

    const result = await bootstrapMonorepo(PROJECT)
    const web = result.packages.find((p) => p.name === "web")!

    expect(web.installedDependencies).toEqual([])

    const pkg = readJson("packages/web/package.json")
    expect(pkg.dependencies.react).toBe("^18.0.0")
  })

  // imports matching the monorepo scope (@myapp/*) are resolved as
  // workspace links instead of hitting the npm registry. this lets
  // bun/npm/pnpm symlink the local package rather than fetching.
  test("resolves workspace deps", async () => {
    write("packages/web/src/App.tsx", 'import { utils } from "@myapp/shared"')
    write("packages/shared/src/index.ts", 'export const utils = {}')

    process.env.foobar = 1
    const result = await bootstrapMonorepo(PROJECT)
    const web = result.packages.find((p) => p.name === "web")!
    const dep = web.installedDependencies.find((d) => d.name === "@myapp/shared")
    expect(dep!.version).toBe("workspace:*")
  })

  test("changedFiles limits scan scope", async () => {
    write("packages/web/src/App.tsx", 'import React from "react_foobar"')
    write("packages/web/src/Other.tsx", 'import lodash from "lodash"')

    const appPath = join(PROJECT, "packages/web/src/App.tsx")
    const result = await bootstrapMonorepo(PROJECT, [appPath])
    const web = result.packages.find((p) => p.name === "web")!

    expect(web.installedDependencies.some((d) => d.name === "react_foobar")).toBe(true)
    expect(web.installedDependencies.some((d) => d.name === "lodash")).toBe(false)
  })



})



