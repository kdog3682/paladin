import { afterEach, describe, expect, test } from "bun:test"
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { discoverWorkspacePackages } from "./discover-workspace"

const tempDirs: string[] = []

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

function makeWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "paladin-discover-"))
  tempDirs.push(dir)
  return dir
}

describe("discoverWorkspacePackages", () => {
  test("parses child package.json files with leading comments", async () => {
    const root = makeWorkspace()
    const pkgDir = join(root, "packages", "codeform")
    mkdirSync(pkgDir, { recursive: true })

    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({ name: "demo", private: true, workspaces: ["packages/*"] }, null, 2),
      "utf-8",
    )

    writeFileSync(
      join(pkgDir, "package.json"),
      `// @demo/packages/codeform/package.json
{
  "name": "@demo/codeform",
  "version": "0.0.0"
}
`,
      "utf-8",
    )

    const names = await discoverWorkspacePackages(root)
    expect(names.has("@demo/codeform")).toBe(true)
  })

  test("skips malformed child package.json files without throwing", async () => {
    const root = makeWorkspace()
    const goodDir = join(root, "packages", "good")
    const badDir = join(root, "packages", "bad")
    mkdirSync(goodDir, { recursive: true })
    mkdirSync(badDir, { recursive: true })

    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({ name: "demo", private: true, workspaces: ["packages/*"] }, null, 2),
      "utf-8",
    )

    writeFileSync(
      join(goodDir, "package.json"),
      JSON.stringify({ name: "@demo/good", version: "0.0.0" }, null, 2),
      "utf-8",
    )
    writeFileSync(join(badDir, "package.json"), "{ bad-json", "utf-8")

    const names = await discoverWorkspacePackages(root)
    expect(names.has("@demo/good")).toBe(true)
  })
})
