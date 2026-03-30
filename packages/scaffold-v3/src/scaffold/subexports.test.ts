// @paladin/scaffold-v3/scaffold/subexports.test.ts

import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { mkdtemp, writeFile, readFile, mkdir } from "fs/promises"
import { join } from "path"
import { tmpdir } from "os"
import { rmSync } from "fs"
import { getImports } from "./get-imports"
import { collectExportEdits, applyExportEdits } from "./package-json"
import { resolveAndDiff } from "./resolve-files"

const PROJECT_NAME = "paladin"
const PROJECT_DIR = "/fake/paladin"
const DEFAULT_WS = "packages"

// --- getImports: subpath detection ---

describe("getImports — workspace subpath", () => {
  test("classifies @paladin/ai/deepseek as workspace with subpath", () => {
    const content = `import { foo } from "@paladin/ai/deepseek"`
    const entries = getImports(content, PROJECT_NAME)
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
      specifier: "@paladin/ai/deepseek",
      package: "@paladin/ai",
      subpath: "deepseek",
      kind: "workspace",
    })
  })

  test("classifies @paladin/ai/deepseek/client as workspace with nested subpath", () => {
    const content = `import { bar } from "@paladin/ai/deepseek/client"`
    const entries = getImports(content, PROJECT_NAME)
    expect(entries[0]).toMatchObject({
      package: "@paladin/ai",
      subpath: "deepseek/client",
      kind: "workspace",
    })
  })

  test("does NOT classify @other/ai/deepseek as workspace", () => {
    const content = `import { foo } from "@other/ai/deepseek"`
    const entries = getImports(content, PROJECT_NAME)
    expect(entries[0].kind).toBe("external")
    // subpath is still parsed, but collectExportEdits ignores external kind entries
  })
})

// --- collectExportEdits: derives correct packageDir and paths ---

describe("collectExportEdits — path resolution", () => {
  function file(imports: ReturnType<typeof getImports>) {
    return {
      absolutePath: `${PROJECT_DIR}/packages/app/src/index.ts`,
      relativePath: "src/index.ts",
      content: "",
      packageName: "app",
      packageDir: `${PROJECT_DIR}/packages/app`,
      isNew: false,
      imports,
    }
  }

  test("maps @paladin/ai/deepseek → packages/ai with ./deepseek subpath", () => {
    const imports = getImports(`import { x } from "@paladin/ai/deepseek"`, PROJECT_NAME)
    const edits = collectExportEdits([file(imports)], PROJECT_NAME, PROJECT_DIR, DEFAULT_WS)

    expect(edits).toHaveLength(1)
    expect(edits[0]).toEqual({
      packageName: "@paladin/ai",
      packageDir: `${PROJECT_DIR}/packages/ai`,
      subpath: "./deepseek",
      target: "./src/deepseek/index.ts",
    })
  })

  test("nested subpath: @paladin/ai/deepseek/client → target ./src/deepseek/client/index.ts", () => {
    const imports = getImports(`import { x } from "@paladin/ai/deepseek/client"`, PROJECT_NAME)
    const edits = collectExportEdits([file(imports)], PROJECT_NAME, PROJECT_DIR, DEFAULT_WS)

    expect(edits[0]).toMatchObject({
      subpath: "./deepseek/client",
      target: "./src/deepseek/client/index.ts",
    })
  })
})

// --- full pipeline: resolveAndDiff → collectExportEdits → applyExportEdits ---

describe("subexports end-to-end", () => {
  let tmp: string

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), "subexports-test-"))
  })

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true })
  })

  async function setupPackage(name: string, existingExports: Record<string, string> = {}) {
    const dir = join(tmp, "packages", name)
    await mkdir(join(dir, "src"), { recursive: true })
    await writeFile(join(dir, "package.json"), JSON.stringify({
      name: `@paladin/${name}`,
      version: "0.1.0",
      exports: existingExports,
      dependencies: {},
    }, null, 2))
    return dir
  }

  test("adds missing subpath export when scaffolding a file that imports it", async () => {
    await setupPackage("ai", { ".": "./src/index.ts" })

    const content = `// @paladin/app/src/index.ts\nimport { foo } from "@paladin/ai/deepseek"\n`
    const changed = await resolveAndDiff(
      [{ content }],
      { projectDir: tmp, projectName: "paladin", workspaceFolders: ["packages"], defaultWorkspaceFolder: "packages" },
    )

    const edits = collectExportEdits(changed, "paladin", tmp, "packages")
    const applied = await applyExportEdits(edits)

    expect(applied).toHaveLength(1)

    const pkg = JSON.parse(await readFile(join(tmp, "packages", "ai", "package.json"), "utf-8"))
    expect(pkg.exports["./deepseek"]).toBe("./src/deepseek/index.ts")
  })

  test("does not overwrite existing subpath export", async () => {
    await setupPackage("ai", { "./deepseek": "./src/deepseek/index.ts" })

    const content = `// @paladin/app/src/index.ts\nimport { foo } from "@paladin/ai/deepseek"\n`
    const changed = await resolveAndDiff(
      [{ content }],
      { projectDir: tmp, projectName: "paladin", workspaceFolders: ["packages"], defaultWorkspaceFolder: "packages" },
    )

    const edits = collectExportEdits(changed, "paladin", tmp, "packages")
    const applied = await applyExportEdits(edits)

    expect(applied).toHaveLength(0)

    const pkg = JSON.parse(await readFile(join(tmp, "packages", "ai", "package.json"), "utf-8"))
    // original value preserved
    expect(pkg.exports["./deepseek"]).toBe("./src/deepseek/index.ts")
  })

  test("silently skips when target package has no package.json yet", async () => {
    // no setupPackage — @paladin/ai doesn't exist
    const content = `// @paladin/app/src/index.ts\nimport { foo } from "@paladin/ai/deepseek"\n`
    const changed = await resolveAndDiff(
      [{ content }],
      { projectDir: tmp, projectName: "paladin", workspaceFolders: ["packages"], defaultWorkspaceFolder: "packages" },
    )

    const edits = collectExportEdits(changed, "paladin", tmp, "packages")
    const applied = await applyExportEdits(edits)

    expect(applied).toHaveLength(0)
  })

  test("handles multiple subpath imports across different packages in one batch", async () => {
    await setupPackage("ai")
    await setupPackage("db")

    const content = [
      `// @paladin/app/src/index.ts`,
      `import { x } from "@paladin/ai/deepseek"`,
      `import { y } from "@paladin/db/schema"`,
    ].join("\n")

    const changed = await resolveAndDiff(
      [{ content }],
      { projectDir: tmp, projectName: "paladin", workspaceFolders: ["packages"], defaultWorkspaceFolder: "packages" },
    )

    const edits = collectExportEdits(changed, "paladin", tmp, "packages")
    await applyExportEdits(edits)

    const ai = JSON.parse(await readFile(join(tmp, "packages", "ai", "package.json"), "utf-8"))
    const db = JSON.parse(await readFile(join(tmp, "packages", "db", "package.json"), "utf-8"))

    expect(ai.exports["./deepseek"]).toBe("./src/deepseek/index.ts")
    expect(db.exports["./schema"]).toBe("./src/schema/index.ts")
  })
})
