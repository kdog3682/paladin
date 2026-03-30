// @paladin/conversation-processor/pipeline.test.ts

import { describe, test, expect, beforeEach } from "bun:test"
import { existsSync, readFileSync, rmSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"
import { stamp } from "@paladin/stamp"
import { runPipeline } from "./pipeline"
import type { ConversationData } from "./types"

const BASE_DIR = join(tmpdir(), "paladin-test-projects")

const EXISTING_FILE = `
===
${join(BASE_DIR, "testproj", "packages", "utils", "src", "remove-me.ts")}
===
export function removeMe() {}
`

beforeEach(() => {
  if (existsSync(BASE_DIR)) rmSync(BASE_DIR, { recursive: true })
})

function makeConversation(
  artifacts: { content: string, updatedAt?: string }[],
  id = "conv-1",
): ConversationData {
  return {
    id,
    title: "test conversation",
    url: `https://claude.ai/chat/${id}`,
    updatedAt: "2025-03-27T00:00:00Z",
    artifacts: artifacts.map((a, i) => ({
      content: a.content,
      updatedAt: a.updatedAt ?? `2025-03-27T00:0${i}:00Z`,
    })),
  }
}

function readJson(path: string) {
  return JSON.parse(readFileSync(path, "utf-8"))
}

describe("pipeline", () => {
  test("a new project creates the workspace root and writes the file", async () => {
    const conversation = makeConversation([
      { content: "// @testproj/utils/src/add.ts\nexport function add(a: number, b: number) { return a + b }" },
    ])

    const result = await runPipeline(conversation, { baseDir: BASE_DIR })

    expect(result!.isNew).toBe(true)
    expect(result!.name).toBe("testproj")
    expect(result!.files).toEqual([
      expect.objectContaining({ path: "packages/utils/src/add.ts", status: "created" }),
    ])
  })

  test("when two artifacts share a path, the latest updatedAt wins", async () => {
    const conversation = makeConversation([
      { content: '// @testproj/utils/src/add.ts\nexport function add() { return "old" }', updatedAt: "2025-03-27T00:00:00Z" },
      { content: '// @testproj/utils/src/add.ts\nexport function add() { return "new" }', updatedAt: "2025-03-27T00:01:00Z" },
    ])

    await runPipeline(conversation, { baseDir: BASE_DIR })

    const content = readFileSync(join(BASE_DIR, "testproj", "packages", "utils", "src", "add.ts"), "utf-8")
    expect(content).toContain("new")
    expect(content).not.toContain("old")
  })

  test("deprecated artifacts are skipped entirely", async () => {
    const conversation = makeConversation([
      { content: "// @testproj/utils/src/old.ts deprecated\nexport function old() {}" },
      { content: "// @testproj/utils/src/keep.ts\nexport function keep() {}" },
    ])

    await runPipeline(conversation, { baseDir: BASE_DIR })

    expect(existsSync(join(BASE_DIR, "testproj", "packages", "utils", "src", "old.ts"))).toBe(false)
    expect(existsSync(join(BASE_DIR, "testproj", "packages", "utils", "src", "keep.ts"))).toBe(true)
  })

  test("delete action removes an existing file from disk", async () => {
    stamp(EXISTING_FILE)

    const conversation = makeConversation([
      { content: "// @testproj/utils/src/remove-me.ts -- delete\n" },
    ])

    await runPipeline(conversation, { baseDir: BASE_DIR })

    expect(existsSync(join(BASE_DIR, "testproj", "packages", "utils", "src", "remove-me.ts"))).toBe(false)
  })

  test("when both delete and write target the same path, write wins", async () => {
    const conversation = makeConversation([
      { content: "// @testproj/utils/src/file.ts -- delete\n", updatedAt: "2025-03-27T00:00:00Z" },
      { content: "// @testproj/utils/src/file.ts\nexport const x = 1", updatedAt: "2025-03-27T00:01:00Z" },
    ])

    await runPipeline(conversation, { baseDir: BASE_DIR })

    const content = readFileSync(join(BASE_DIR, "testproj", "packages", "utils", "src", "file.ts"), "utf-8")
    expect(content).toContain("export const x")
  })

  test("external imports are added as dependencies in package.json", async () => {
    const conversation = makeConversation([
      { content: '// @testproj/api/src/server.ts\nimport { Hono } from "hono"\nexport const app = new Hono()' },
    ])

    await runPipeline(conversation, { baseDir: BASE_DIR })

    const pkg = readJson(join(BASE_DIR, "testproj", "packages", "api", "package.json"))
    expect(pkg.dependencies.hono).toMatch(/^\^?\d+\.\d+\.\d+/)
  })

  test("workspace imports use the workspace:* protocol", async () => {
    const conversation = makeConversation([
      { content: "// @testproj/utils/src/index.ts\nexport function util() {}" },
      { content: '// @testproj/api/src/server.ts\nimport { util } from "@testproj/utils"\nexport const app = util()' },
    ])

    await runPipeline(conversation, { baseDir: BASE_DIR })

    const pkg = readJson(join(BASE_DIR, "testproj", "packages", "api", "package.json"))
    expect(pkg.dependencies["@testproj/utils"]).toBe("workspace:*")
  })

  test("files at the project root are written outside packages/", async () => {
    const conversation = makeConversation([
      { content: "// @testproj/readme.md\n# My Project\n\nHello world" },
    ])

    await runPipeline(conversation, { baseDir: BASE_DIR })

    const content = readFileSync(join(BASE_DIR, "testproj", "readme.md"), "utf-8")
    expect(content).toContain("# My Project")
  })

  test("a second conversation accumulates refs alongside the first", async () => {
    const conv1 = makeConversation(
      [{ content: "// @testproj/utils/src/a.ts\nexport const a = 1" }],
      "conv-1",
    )
    const conv2 = makeConversation(
      [{ content: "// @testproj/utils/src/b.ts\nexport const b = 2" }],
      "conv-2",
    )

    await runPipeline(conv1, { baseDir: BASE_DIR })
    const result = await runPipeline(conv2, { baseDir: BASE_DIR })

    expect(result!.conversationRefs).toHaveLength(2)
    const ids = result!.conversationRefs.map((r: any) => r.id)
    expect(ids).toContain("conv-1")
    expect(ids).toContain("conv-2")
  })

  test("reprocessing the same conversation is skipped", async () => {
    const conversation = makeConversation([
      { content: "// @testproj/utils/src/a.ts\nexport const a = 1" },
    ])

    const r1 = await runPipeline(conversation, { baseDir: BASE_DIR })
    const r2 = await runPipeline(conversation, { baseDir: BASE_DIR })

    expect(r1!.files).toHaveLength(1)
    expect(r2).toBeNull()
  })

  test("subpath imports patch the target package exports field", async () => {
    const conversation = makeConversation([
      { content: "// @testproj/utils/src/helpers.ts\nexport function help() {}" },
      { content: '// @testproj/api/src/server.ts\nimport { help } from "@testproj/utils/helpers"\nexport const app = help()' },
    ])

    await runPipeline(conversation, { baseDir: BASE_DIR })

    const pkg = readJson(join(BASE_DIR, "testproj", "packages", "utils", "package.json"))
    expect(pkg.exports["./helpers"]).toBe("./src/helpers.ts")
  })

  test("json files have their comment header stripped before writing", async () => {
    const conversation = makeConversation([
      { content: '// @testproj/utils/tsconfig.json\n{"compilerOptions":{"strict":true}}' },
    ])

    await runPipeline(conversation, { baseDir: BASE_DIR })

    const content = readFileSync(join(BASE_DIR, "testproj", "packages", "utils", "tsconfig.json"), "utf-8")
    expect(content).not.toContain("//")
    const parsed = JSON.parse(content)
    expect(parsed.compilerOptions.strict).toBe(true)
  })

  test("json files strip multiple leading comments before writing", async () => {
    const conversation = makeConversation([
      { content: '// @testproj/utils/tsconfig.json\n// generated by assistant\n{"compilerOptions":{"strict":true}}' },
    ])

    await runPipeline(conversation, { baseDir: BASE_DIR })

    const content = readFileSync(join(BASE_DIR, "testproj", "packages", "utils", "tsconfig.json"), "utf-8")
    expect(content).not.toContain("//")
    const parsed = JSON.parse(content)
    expect(parsed.compilerOptions.strict).toBe(true)
  })
})
