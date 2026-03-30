// @paladin/conversation-processor/pipeline.mochi.ts

import { existsSync, readFileSync, rmSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"
import { stamp, beforeEach } from "@paladin/stamp"
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
  artifacts: { content: string; updatedAt?: string }[],
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

/* a new project creates the workspace root and writes the file */
export async function newProjectScaffold() {
  const conversation = makeConversation([
    { content: "// @testproj/utils/src/add.ts\nexport function add(a: number, b: number) { return a + b }" },
  ])

  return runPipeline(conversation, { baseDir: BASE_DIR })
  // isNew: true
  // name: "testproj"
  // files: [{ path: "packages/utils/src/add.ts", status: "created" }]
}

/* when two artifacts share a path, the latest updatedAt wins */
export async function deduplicatesByUpdatedAt() {
  const conversation = makeConversation([
    { content: '// @testproj/utils/src/add.ts\nexport function add() { return "old" }', updatedAt: "2025-03-27T00:00:00Z" },
    { content: '// @testproj/utils/src/add.ts\nexport function add() { return "new" }', updatedAt: "2025-03-27T00:01:00Z" },
  ])

  await runPipeline(conversation, { baseDir: BASE_DIR })

  return readFileSync(join(BASE_DIR, "testproj", "packages", "utils", "src", "add.ts"), "utf-8")
  // contains "new", does not contain "old"
}

/* deprecated artifacts are skipped entirely */
export async function skipsDeprecated() {
  const conversation = makeConversation([
    { content: "// @testproj/utils/src/old.ts deprecated\nexport function old() {}" },
    { content: "// @testproj/utils/src/keep.ts\nexport function keep() {}" },
  ])

  await runPipeline(conversation, { baseDir: BASE_DIR })

  return [
    existsSync(join(BASE_DIR, "testproj", "packages", "utils", "src", "old.ts")),
    existsSync(join(BASE_DIR, "testproj", "packages", "utils", "src", "keep.ts")),
  ]
  // [false, true]
}

/* delete action removes an existing file from disk */
export async function deleteRemovesFile() {
  stamp(EXISTING_FILE)

  const conversation = makeConversation([
    { content: "// @testproj/utils/src/remove-me.ts -- delete\n" },
  ])

  await runPipeline(conversation, { baseDir: BASE_DIR })

  return existsSync(join(BASE_DIR, "testproj", "packages", "utils", "src", "remove-me.ts"))
  // false
}

/* when both delete and write target the same path, write wins */
export async function writeWinsOverDelete() {
  const conversation = makeConversation([
    { content: "// @testproj/utils/src/file.ts -- delete\n", updatedAt: "2025-03-27T00:00:00Z" },
    { content: "// @testproj/utils/src/file.ts\nexport const x = 1", updatedAt: "2025-03-27T00:01:00Z" },
  ])

  await runPipeline(conversation, { baseDir: BASE_DIR })

  return readFileSync(join(BASE_DIR, "testproj", "packages", "utils", "src", "file.ts"), "utf-8")
  // contains "export const x"
}

/* external imports are added as dependencies in package.json */
export async function externalDepsAdded() {
  const conversation = makeConversation([
    { content: '// @testproj/api/src/server.ts\nimport { Hono } from "hono"\nexport const app = new Hono()' },
  ])

  await runPipeline(conversation, { baseDir: BASE_DIR })

  return readJson(join(BASE_DIR, "testproj", "packages", "api", "package.json"))
  // dependencies.hono exists with a version like "^x.x.x"
}

/* workspace imports use the workspace:* protocol */
export async function workspaceDepsProtocol() {
  const conversation = makeConversation([
    { content: "// @testproj/utils/src/index.ts\nexport function util() {}" },
    { content: '// @testproj/api/src/server.ts\nimport { util } from "@testproj/utils"\nexport const app = util()' },
  ])

  await runPipeline(conversation, { baseDir: BASE_DIR })

  return readJson(join(BASE_DIR, "testproj", "packages", "api", "package.json"))
  // dependencies["@testproj/utils"] === "workspace:*"
}

/* files at the project root are written outside packages/ */
export async function rootFilesWritten() {
  const conversation = makeConversation([
    { content: "// @testproj/readme.md\n# My Project\n\nHello world" },
  ])

  await runPipeline(conversation, { baseDir: BASE_DIR })

  return readFileSync(join(BASE_DIR, "testproj", "readme.md"), "utf-8")
  // contains "# My Project"
}

/* a second conversation accumulates refs alongside the first */
export async function accumulatesRefs() {
  const conv1 = makeConversation(
    [{ content: "// @testproj/utils/src/a.ts\nexport const a = 1" }],
    "conv-1",
  )
  const conv2 = makeConversation(
    [{ content: "// @testproj/utils/src/b.ts\nexport const b = 2" }],
    "conv-2",
  )

  await runPipeline(conv1, { baseDir: BASE_DIR })

  return runPipeline(conv2, { baseDir: BASE_DIR })
  // conversationRefs.length === 2
  // conversationRefs ids include "conv-1" and "conv-2"
}

/* reprocessing the same conversation is skipped */
export async function skipsStaleArtifacts() {
  const conversation = makeConversation([
    { content: "// @testproj/utils/src/a.ts\nexport const a = 1" },
  ])

  const r1 = await runPipeline(conversation, { baseDir: BASE_DIR })
  const r2 = await runPipeline(conversation, { baseDir: BASE_DIR })

  return [r1!.files.length, r2]
  // [1, null]
}

/* subpath imports patch the target package exports field */
export async function subpathExportsPatched() {
  const conversation = makeConversation([
    { content: "// @testproj/utils/src/helpers.ts\nexport function help() {}" },
    { content: '// @testproj/api/src/server.ts\nimport { help } from "@testproj/utils/helpers"\nexport const app = help()' },
  ])

  await runPipeline(conversation, { baseDir: BASE_DIR })

  return readJson(join(BASE_DIR, "testproj", "packages", "utils", "package.json"))
  // exports["./helpers"] points to "./src/helpers.ts"
}

/* json files have their comment header stripped before writing */
export async function jsonHeadersStripped() {
  const conversation = makeConversation([
    { content: '// @testproj/utils/tsconfig.json\n{"compilerOptions":{"strict":true}}' },
  ])

  await runPipeline(conversation, { baseDir: BASE_DIR })

  return readFileSync(join(BASE_DIR, "testproj", "packages", "utils", "tsconfig.json"), "utf-8")
  // valid json, no "//" comment, compilerOptions.strict === true
}
