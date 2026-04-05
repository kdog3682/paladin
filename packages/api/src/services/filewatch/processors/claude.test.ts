// @paladin/packages/api/src/services/filewatch/processors/claude.test.ts

import { describe, it, expect } from "bun:test"
import { processConversation } from "../process"

const BASE_PROJECTS_DIR = "/home/user/projects"

function makeConversation(messages: object[]) {
  return {
    url: "https://claude.ai/chat/abc123",
    title: "test",
    updatedAt: "2026-01-01T00:00:00Z",
    messages,
  }
}

function assistantMsg(blocks: object[]) {
  return { sender: "assistant", content: blocks }
}

function artifactCreate(id: string, content: string) {
  return {
    type: "tool_use",
    name: "artifacts",
    input: { command: "create", id, content },
    stop_timestamp: "2026-01-01T00:00:01Z",
  }
}

function artifactUpdate(id: string, old_str: string, new_str: string) {
  return {
    type: "tool_use",
    name: "artifacts",
    input: { command: "update", id, old_str, new_str },
    stop_timestamp: "2026-01-01T00:00:02Z",
  }
}

describe("processConversation", () => {
  it("returns empty array when no assistant messages", () => {
    const conv = makeConversation([
      { sender: "human", content: [{ type: "text", text: "hello" }] },
    ])
    expect(processConversation(conv as any, BASE_PROJECTS_DIR)).toEqual([])
  })

  it("returns empty array when no artifact blocks", () => {
    const conv = makeConversation([
      assistantMsg([{ type: "text", text: "here's some code" }]),
    ])
    expect(processConversation(conv as any, BASE_PROJECTS_DIR)).toEqual([])
  })

  it("extracts file from @-scoped artifact header", () => {
    const content = `// @myproject/packages/utils/src/index.ts\nexport const x = 1\n`
    const conv = makeConversation([
      assistantMsg([artifactCreate("art1", content)]),
    ])
    const files = processConversation(conv as any, BASE_PROJECTS_DIR)
    expect(files).toHaveLength(1)
    expect(files[0].path).toBe("/home/user/projects/myproject/packages/utils/src/index.ts")
    expect(files[0].content).toContain("export const x = 1")
  })

  it("returns empty when artifact has no recognizable path header", () => {
    const content = `// just a comment, no path\nexport const x = 1\n`
    const conv = makeConversation([
      assistantMsg([artifactCreate("art1", content)]),
    ])
    const files = processConversation(conv as any, BASE_PROJECTS_DIR)
    expect(files).toHaveLength(0)
  })

  it("applies update command to existing artifact", () => {
    const original = `// @proj/packages/lib/src/foo.ts\nexport const a = 1\nexport const b = 2\n`
    const conv = makeConversation([
      assistantMsg([
        artifactCreate("art1", original),
        artifactUpdate("art1", "export const b = 2", "export const b = 99"),
      ]),
    ])
    const files = processConversation(conv as any, BASE_PROJECTS_DIR)
    expect(files).toHaveLength(1)
    expect(files[0].content).toContain("export const b = 99")
    expect(files[0].content).not.toContain("export const b = 2")
  })

  it("ignores update when artifact id not found", () => {
    const conv = makeConversation([
      assistantMsg([
        artifactUpdate("missing-id", "old", "new"),
      ]),
    ])
    expect(processConversation(conv as any, BASE_PROJECTS_DIR)).toEqual([])
  })

  it("keeps latest version when same id created twice", () => {
    const v1 = `// @proj/packages/lib/src/foo.ts\nexport const x = 1\n`
    const v2 = `// @proj/packages/lib/src/foo.ts\nexport const x = 2\n`
    const conv = makeConversation([
      assistantMsg([
        artifactCreate("art1", v1),
        artifactCreate("art1", v2),
      ]),
    ])
    const files = processConversation(conv as any, BASE_PROJECTS_DIR)
    expect(files).toHaveLength(1)
    expect(files[0].content).toContain("export const x = 2")
  })

  it("skips artifact with SKIP_ACTIONS in header", () => {
    const content = `// @proj/packages/lib/src/old.ts deleted\nexport const x = 1\n`
    const conv = makeConversation([
      assistantMsg([artifactCreate("art1", content)]),
    ])
    expect(processConversation(conv as any, BASE_PROJECTS_DIR)).toEqual([])
  })

  it("resolves relative paths using baseDir from user message", () => {
    const content = `// src/helper.ts\nexport const h = true\n`
    const conv = makeConversation([
      {
        sender: "human",
        content: [{ type: "text", text: "The current directory is @myproject/packages/app" }],
      },
      assistantMsg([artifactCreate("art1", content)]),
    ])
    const files = processConversation(conv as any, BASE_PROJECTS_DIR)
    expect(files).toHaveLength(1)
    expect(files[0].path).toBe("/home/user/projects/myproject/packages/app/src/helper.ts")
  })
})
