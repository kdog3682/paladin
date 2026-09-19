import { afterAll, beforeEach, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { isBash, isWrite } from "../ops"
import { plan } from "../plan/plan"
import { resolveDependencies } from "./resolveDependencies"
import { VersionCache } from "./versions"
import type { PathResolutionOpts } from "../types"

const fetched: string[] = []
const realFetch = globalThis.fetch

globalThis.fetch = (async (url: string | URL) => {
  fetched.push(String(url))
  return new Response(JSON.stringify({ version: "1.2.3" }))
}) as unknown as typeof fetch

afterAll(() => {
  globalThis.fetch = realFetch
})

beforeEach(() => {
  fetched.length = 0
})

const scratch = () => mkdtempSync(join(tmpdir(), "resolve-deps-"))

/** Plans `input` under a fresh base and resolves the first unit's dependencies. */
async function resolve(input: string, base = scratch(), versions = new VersionCache(join(scratch(), "cache.json"))) {
  const opts: PathResolutionOpts = { base }
  const project = (await plan(input, opts))!
  const ops = await resolveDependencies(project, project.units[0]!, opts, versions)
  const manifest = ops.filter(isWrite).find((op) => op.path.endsWith("package.json"))
  return {
    base,
    project,
    ops,
    gained: manifest ? JSON.parse(manifest.content) : null,
    install: ops.filter(isBash),
  }
}

test("classifies each import by where it actually lives", async () => {
  const base = scratch()
  mkdirSync(join(base, "paladin"))

  const { gained } = await resolve(
    `
// @mathpen/manim/src/index.ts
import { collectImports } from "@paladin/utils/collectImports"
import { render } from "@mathpen/core"
import { self } from "@mathpen/manim"
import { z } from "zod"
import fp from "lodash/fp"
import { join } from "path"
import { readFile } from "node:fs/promises"
import { local } from "./local"
`,
    base,
  )

  expect(gained.dependencies).toEqual({
    "@paladin/utils": "file:../../../paladin/packages/utils",
    "@mathpen/core": "workspace:*",
    zod: "^1.2.3",
    lodash: "^1.2.3",
  })
  expect(fetched).toHaveLength(2)
})

test("a scope with no project under base is a registry package", async () => {
  const { gained } = await resolve(`
// @mathpen/plot/src/index.ts
import { render } from "@paladin/utils"
`)

  expect(gained.dependencies).toEqual({ "@paladin/utils": "^1.2.3" })
})

test("imports from test files land in devDependencies", async () => {
  const { gained } = await resolve(`
// @app/ui/src/button.tsx
import { useState } from "react"

// @app/ui/src/button.test.ts
import { render } from "happy-dom"
`)

  expect(gained.dependencies).toEqual({ react: "^1.2.3" })
  expect(gained.devDependencies).toEqual({ "happy-dom": "^1.2.3" })
})

test("leaves deps the authored manifest already declares alone, and asks for no install", async () => {
  const { ops, gained } = await resolve(`
// @app/core/package.json
{ "name": "@app/core", "dependencies": { "dayjs": "^0.9.0" } }

// @app/core/src/index.ts
import dayjs from "dayjs"
`)

  expect(ops).toEqual([])
  expect(gained).toBeNull()
  expect(fetched).toEqual([])
})

test("a gained dependency emits a strict install at the project root, and the versions it learned", async () => {
  const versions = new VersionCache(join(scratch(), "cache.json"))
  const { base, ops, install } = await resolve(
    `
// @app/first/src/index.ts
import { nanoid } from "nanoid"
`,
    undefined,
    versions,
  )

  expect(install).toHaveLength(1)
  expect(install[0]).toMatchObject({
    args: ["bun", "install"],
    cwd: join(base, "app"),
    purpose: "install",
    strict: true,
  })

  const cache = ops.filter(isWrite).find((op) => op.path === versions.path)!
  expect(cache.mode).toBe("merge")
  expect(JSON.parse(cache.content)).toEqual({ nanoid: "^1.2.3" })
})

test("a version already in the cache costs no registry call", async () => {
  const cachePath = join(scratch(), "cache.json")
  await Bun.write(cachePath, JSON.stringify({ nanoid: "^5.0.0" }))

  const { gained, ops } = await resolve(
    `
// @app/first/src/index.ts
import { nanoid } from "nanoid"
`,
    undefined,
    new VersionCache(cachePath),
  )

  expect(gained.dependencies).toEqual({ nanoid: "^5.0.0" })
  expect(fetched).toEqual([])
  expect(ops.filter(isWrite).some((op) => op.path === cachePath)).toBe(false)
})
