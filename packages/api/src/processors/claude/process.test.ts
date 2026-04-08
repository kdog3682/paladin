// src/processors/claude/process.test.ts

import { describe, test, expect } from "bun:test"
import { processConversation } from "./process"
import type { Conversation } from "../../types/claude"
import { readdir, stat, readFile } from "node:fs/promises"
import { join } from "node:path"




async function getMostRecentFile(dir: string) {
  const entries = await readdir(dir)
  const jsonFiles = entries.filter(f => f.endsWith(".json") && !f.startsWith("."))

  let newest = { name: "", mtime: 0 }
  for (const name of jsonFiles) {
    const s = await stat(join(dir, name))
    if (s.mtimeMs > newest.mtime) newest = { name, mtime: s.mtimeMs }
  }

  return join(dir, newest.name)
}

async function getScratchConversation() {
    const file = await getMostRecentFile('/home/kdog3682/scratch')
    const data = JSON.parse(await readFile(file, 'utf-8'))
    return data
}


// --- Helpers ---

const ROOT = "/tmp/projects"

const conv = (messages: Conversation["messages"], title = ""): Conversation => ({
  url: "https://claude.ai/chat/123",
  title,
  updatedAt: "2025-01-01T00:00:00Z",
  messages,
})

const userMsg = (text: string) => ({
  sender: "human",
  content: [{ type: "text", text }],
})

const artifactCreate = (id: string, content: string) => ({
  sender: "assistant",
  content: [{
    type: "tool_use",
    name: "artifacts",
    input: { command: "create", id, content },
    stop_timestamp: "2025-01-01T00:00:00Z",
  }],
})

const artifactUpdate = (id: string, old_str: string, new_str: string) => ({
  sender: "assistant",
  content: [{
    type: "tool_use",
    name: "artifacts",
    input: { command: "update", id, old_str, new_str },
    stop_timestamp: "2025-01-01T00:01:00Z",
  }],
})

const process = (header: string, opts: { user?: string, title?: string } = {}) =>
  processConversation(
    conv([
      ...(opts.user ? [userMsg(opts.user)] : []),
      artifactCreate("a", `// ${header}\nconsole.log('hi')`),
    ], opts.title ?? ""),
    ROOT,
  )

const expectPath = async (
  header: string,
  opts: { user?: string, title?: string },
  assertions: (path: string) => void,
) => {
  const result = await process(header, opts)
  expect(result).not.toBeNull()
  assertions(result!.files[0].path)
}

// --- Tests ---




describe("processConversation", () => {
  describe("returns null", () => {
    test("when no artifacts", async () => {
      const result = await processConversation(conv([userMsg("hello")]), ROOT)
      expect(result).toBeNull()
    })

    test("when no header path", async () => {
      const result = await processConversation(
        conv([artifactCreate("a", "no path here\nconsole.log('hi')")]),
        ROOT,
      )
      expect(result).toBeNull()
    })
  })

  describe("extraction", () => {
    test("extracts file with scoped path", async () => {
      const result = await process("@foo/bar/index.ts")
      expect(result).not.toBeNull()
      expect(result!.files).toHaveLength(1)
      expect(result!.files[0].path).toContain("foo")
      expect(result!.files[0].path).toContain("bar")
      expect(result!.project.name).toBe("foo")
    })

    test("applies update command", async () => {
      const result = await processConversation(
        conv([
          artifactCreate("a", "// @foo/bar/index.ts\nconst x = 1"),
          artifactUpdate("a", "const x = 1", "const x = 2"),
        ]),
        ROOT,
      )
      expect(result).not.toBeNull()
      expect(result!.files[0].content).toContain("const x = 2")
    })
  })

  describe("baseDir resolution", () => {
    test("picks up baseDir from user message", async () => {
      await expectPath("src/index.ts", { user: "The current directory is @foo/bar" }, (p) => {
        expect(p).toContain("foo")
      })
    })
    test("picks up baseDir from user message. any presence of @org/name works.", async () => {
      await expectPath("src/index.ts", { user: "abc @abc @foo/bar howdy @nope/asdf" }, (p) => {
        expect(p).toContain("foo")
      })
      await expectPath("src/index.ts", { user: "abc @abc @FOO/BAR howdy @nope/asdf" }, (p) => {
        expect(p).toContain("foo/packages/bar")
      })
    })
    test("falls back to title for scope", async () => {
      await expectPath("src/index.ts", { title: "working on @foo/bar" }, (p) => {
        expect(p).toContain("foo/packages/bar")
      })
    })

    test("throws for relative path with no baseDir", async () => {
      expect(process("lib/utils.ts")).rejects.toThrow("cannot resolve relative path")
    })
  })

  describe("path resolution", () => {
    test("@scope/pkg injects /packages/", async () => {
      await expectPath("@foo/bar/index.ts", {}, (p) => {
        expect(p).toBe(`${ROOT}/foo/packages/bar/src/index.ts`)
      })
    })

    test("@scope/packages/pkg does not double inject", async () => {
      await expectPath("@foo/packages/bar/index.ts", {}, (p) => {
        expect(p).toBe(`${ROOT}/foo/packages/bar/src/index.ts`)
        expect(p).not.toContain("packages/packages")
      })
    })

    test("relative path resolves against baseDir from message", async () => {
      await expectPath("lib/utils.ts", { user: "The current directory is @foo/bar" }, (p) => {
        expect(p).toContain("foo/packages/bar/src/lib/utils.ts")
      })
    })

    test("relative path resolves against scope from title", async () => {
      await expectPath("lib/utils.ts", { title: "working on @foo/bar" }, (p) => {
        expect(p).toContain("foo/packages/bar/src/lib/utils.ts")
      })
    })

    test("scoped path with src does not double inject", async () => {
      await expectPath("@foo/bar/src/index.ts", {}, (p) => {
        expect(p).not.toContain("src/src")
      })
    })
    test("relative path with src does not double inject", async () => {
      await expectPath("src/lib/utils.ts", { user: "The current directory is @foo/bar" }, (p) => {
        expect(p).not.toContain("src/src")
      })
    })



  })
})

  test("real conversation", async () => {
    const result = await processConversation(await getScratchConversation(), ROOT)
    expect(result).not.toBeNull()
    // expect(result.not.toBeNull()) // lmao 
  })
