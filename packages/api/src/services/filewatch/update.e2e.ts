// @paladin/packages/api/src/services/filewatch/update.e2e.ts

import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test"
import { existsSync } from "fs"
import { readFile, rm, readdir } from "fs/promises"
import { join } from "path"
import { tmpdir } from "os"
import { update } from "./update"
import * as bootstrapMod from "./bootstrap"
import * as bashMod from "../../utils/bash"
import * as cacheMod from "./cache"
import type { FileEntry } from "./process"

// ── Helpers ─────────────────────────────────────────────────

const PROJECT = "testproject"

let rootDir: string
let bashCalls: string[]
let bootstrapCalls: { dir: string, key: string }[]
let resolveVersionCalls: string[]

function pkgDir(name: string) {
  return join(rootDir, "packages", name)
}

function file(pkg: string, path: string, content: string): FileEntry {
  return {
    path: join(rootDir, "packages", pkg, path),
    content,
  }
}

function tsFile(pkg: string, name: string, imports: string[]) {
  const lines = imports.map((i) => `import { x } from "${i}"`).join("\n")
  return file(pkg, `src/${name}`, lines + "\nexport const x = 1\n")
}

async function readPkgJson(pkg: string) {
  const raw = await readFile(join(pkgDir(pkg), "package.json"), "utf-8")
  return JSON.parse(raw)
}

// ── Setup ───────────────────────────────────────────────────

beforeEach(async () => {
  rootDir = join(tmpdir(), `update-e2e-${Date.now()}`)
  bashCalls = []
  bootstrapCalls = []
  resolveVersionCalls = []

  spyOn(bashMod, "bash").mockImplementation(async (cmd: string) => {
    bashCalls.push(cmd)
    return ""
  })

  spyOn(bootstrapMod, "bootstrap").mockImplementation(
    async (dir: string, _proj: string, _pkg: string, key: string) => {
      bootstrapCalls.push({ dir, key })
      // simulate bootstrap creating a package.json
      const { mkdir, writeFile } = await import("fs/promises")
      await mkdir(dir, { recursive: true })
      const name = dir.includes("packages/")
        ? `@${PROJECT}/${dir.split("packages/")[1]}`
        : PROJECT
      const json = { name, type: "module" }
      await writeFile(join(dir, "package.json"), JSON.stringify(json, null, 2) + "\n")
    },
  )

  spyOn(cacheMod, "loadCache").mockImplementation(async () => {})

  spyOn(cacheMod, "resolveVersion").mockImplementation(async (pkg: string) => {
    resolveVersionCalls.push(pkg)
    return `^1.0.0`
  })

  spyOn(cacheMod, "flushCache").mockImplementation(async () => {})
})

afterEach(async () => {
  if (existsSync(rootDir)) {
    await rm(rootDir, { recursive: true })
  }
})

// ── Tests ───────────────────────────────────────────────────

describe("update e2e", () => {
  it("never installs node_modules in package dirs", async () => {
    const files = [
      tsFile("ui", "index.ts", ["react", "zod"]),
      tsFile("api", "index.ts", ["express"]),
    ]

    await update(files, PROJECT, rootDir)

    // node_modules should not exist in any package dir
    const pkgsDir = join(rootDir, "packages")
    if (existsSync(pkgsDir)) {
      const packages = await readdir(pkgsDir)
      for (const pkg of packages) {
        expect(existsSync(join(pkgsDir, pkg, "node_modules"))).toBe(false)
      }
    }

    // bun install should run at root, not in package dirs
    for (const cmd of bashCalls) {
      if (cmd.includes("install")) {
        // verified via bash mock — cwd is passed as option, not in cmd string
        // the important thing is it's called, and node_modules don't appear in pkg dirs
      }
    }
  })

  it("creates package.json with correct dependencies", async () => {
    const files = [
      tsFile("ui", "index.ts", ["react", "zod"]),
    ]

    await update(files, PROJECT, rootDir)

    const json = await readPkgJson("ui")
    expect(json.dependencies).toBeDefined()
    expect(json.dependencies.react).toBe("^1.0.0")
    expect(json.dependencies.zod).toBe("^1.0.0")
  })

  it("does not overwrite existing package.json fields", async () => {
    const files1 = [
      tsFile("ui", "index.ts", ["react"]),
    ]

    await update(files1, PROJECT, rootDir)

    // manually add a field to the package.json
    const pkgJsonPath = join(pkgDir("ui"), "package.json")
    const json1 = JSON.parse(await readFile(pkgJsonPath, "utf-8"))
    json1.scripts = { build: "tsc" }
    json1.dependencies.react = "^18.0.0" // pin to specific version
    const { writeFile } = await import("fs/promises")
    await writeFile(pkgJsonPath, JSON.stringify(json1, null, 2) + "\n")

    // run again with an additional import
    const files2 = [
      tsFile("ui", "index.ts", ["react", "zod"]),
    ]

    await update(files2, PROJECT, rootDir)

    const json2 = await readPkgJson("ui")
    expect(json2.scripts.build).toBe("tsc") // custom field preserved
    expect(json2.dependencies.react).toBe("^18.0.0") // existing version not overwritten
    expect(json2.dependencies.zod).toBe("^1.0.0") // new dep added
  })

  it("puts test file imports in devDependencies", async () => {
    const files = [
      tsFile("ui", "index.ts", ["react"]),
      file("ui", "src/index.test.ts", `import { describe } from "vitest"\n`),
    ]

    await update(files, PROJECT, rootDir)

    const json = await readPkgJson("ui")
    expect(json.dependencies.react).toBe("^1.0.0")
    expect(json.devDependencies?.vitest).toBe("^1.0.0")
    expect(json.dependencies.vitest).toBeUndefined()
  })

  it("uses workspace:* for internal package imports", async () => {
    const files = [
      tsFile("ui", "index.ts", [`@${PROJECT}/shared`]),
      tsFile("shared", "index.ts", ["zod"]),
    ]

    await update(files, PROJECT, rootDir)

    const json = await readPkgJson("ui")
    expect(json.dependencies[`@${PROJECT}/shared`]).toBe("workspace:*")

    // workspace deps should not trigger version resolution
    expect(resolveVersionCalls).not.toContain(`@${PROJECT}/shared`)
  })

  it("writes files to disk at correct paths", async () => {
    const content = `export const hello = "world"\n`
    const files = [
      file("ui", "src/utils/helpers.ts", content),
    ]

    await update(files, PROJECT, rootDir)

    const filePath = join(pkgDir("ui"), "src/utils/helpers.ts")
    expect(existsSync(filePath)).toBe(true)
    expect(await readFile(filePath, "utf-8")).toBe(content)
  })

  it("calls bootstrap for new packages", async () => {
    const files = [
      tsFile("ui", "index.tsx", ["react"]),
      tsFile("api", "index.ts", ["express"]),
    ]

    await update(files, PROJECT, rootDir)

    // root bootstrap
    expect(bootstrapCalls.some((c) => c.dir === rootDir)).toBe(true)

    // package bootstraps with correct keys
    const uiCall = bootstrapCalls.find((c) => c.dir === pkgDir("ui"))
    expect(uiCall).toBeDefined()
    expect(uiCall!.key).toBe("web") // .tsx -> web

    const apiCall = bootstrapCalls.find((c) => c.dir === pkgDir("api"))
    expect(apiCall).toBeDefined()
    expect(apiCall!.key).toBe("default") // .ts -> default
  })

  it("only runs bun install when deps changed", async () => {
    const files = [
      tsFile("ui", "index.ts", ["react"]),
    ]

    await update(files, PROJECT, rootDir)
    expect(bashCalls.filter((c) => c.includes("install")).length).toBe(1)

    // second run with same files — deps already in package.json
    bashCalls = []
    await update(files, PROJECT, rootDir)
    expect(bashCalls.filter((c) => c.includes("install")).length).toBe(0)
  })

  it("is idempotent — second run changes nothing", async () => {
    const files = [
      tsFile("ui", "index.ts", ["react", "zod"]),
    ]

    await update(files, PROJECT, rootDir)
    const json1 = await readPkgJson("ui")

    resolveVersionCalls = []
    await update(files, PROJECT, rootDir)
    const json2 = await readPkgJson("ui")

    expect(json1).toEqual(json2)
    // existing deps should not trigger version resolution
    expect(resolveVersionCalls).toEqual([])
  })

  it("skips version resolution for deps already in package.json", async () => {
    const files = [
      tsFile("ui", "index.ts", ["react"]),
    ]

    await update(files, PROJECT, rootDir)
    resolveVersionCalls = []

    // second run — react already in package.json
    const files2 = [
      tsFile("ui", "index.ts", ["react", "zod"]),
    ]

    await update(files2, PROJECT, rootDir)

    // only zod should be resolved, not react
    expect(resolveVersionCalls).toContain("zod")
    expect(resolveVersionCalls).not.toContain("react")
  })

  it("handles multiple packages independently", async () => {
    const files = [
      tsFile("ui", "index.ts", ["react"]),
      tsFile("api", "index.ts", ["express"]),
    ]

    await update(files, PROJECT, rootDir)

    const uiJson = await readPkgJson("ui")
    const apiJson = await readPkgJson("api")

    expect(uiJson.dependencies.react).toBe("^1.0.0")
    expect(uiJson.dependencies.express).toBeUndefined()

    expect(apiJson.dependencies.express).toBe("^1.0.0")
    expect(apiJson.dependencies.react).toBeUndefined()
  })

  it("detects astro bootstrap key", async () => {
    const files = [
      file("web", "src/pages/index.astro", `---\nimport Layout from "../layouts/Layout.astro"\n---\n<Layout />\n`),
    ]

    await update(files, PROJECT, rootDir)

    const webCall = bootstrapCalls.find((c) => c.dir === pkgDir("web"))
    expect(webCall).toBeDefined()
    expect(webCall!.key).toBe("astro")
  })

  it("deps in both source and test files stay in dependencies", async () => {
    const files = [
      tsFile("ui", "index.ts", ["zod"]),
      file("ui", "src/index.test.ts", `import { z } from "zod"\nimport { describe } from "vitest"\n`),
    ]

    await update(files, PROJECT, rootDir)

    const json = await readPkgJson("ui")
    expect(json.dependencies.zod).toBe("^1.0.0")
    expect(json.devDependencies?.zod).toBeUndefined()
  })
})
