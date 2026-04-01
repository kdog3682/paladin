// @paladin/conversation-processor/runnable-watch.test.ts

import { describe, expect, test } from "bun:test"
import type { BashResult } from "@paladin/utils/bash"
import {
  createRunnableWatcher,
  mapProjectFilesToPaths,
  splitRunnableFiles,
} from "./runnable-watch"

describe("splitRunnableFiles", () => {
  test("classifies mochi, test-like, and demo files", () => {
    const files = [
      "/repo/packages/api/src/flow.mochi.ts",
      "/repo/packages/api/src/a.test.ts",
      "/repo/packages/api/src/b.spec.ts",
      "/repo/packages/api/src/c.e2e.ts",
      "/repo/packages/api/src/d.unit.ts",
      "/repo/packages/api/src/showcase.demo.ts",
      "/repo/packages/api/src/index.ts",
    ]

    const result = splitRunnableFiles(files)

    expect(result.mochiFiles).toEqual(["/repo/packages/api/src/flow.mochi.ts"])
    expect(result.testFiles).toEqual([
      "/repo/packages/api/src/a.test.ts",
      "/repo/packages/api/src/b.spec.ts",
      "/repo/packages/api/src/c.e2e.ts",
      "/repo/packages/api/src/d.unit.ts",
    ])
    expect(result.demoFiles).toEqual(["/repo/packages/api/src/showcase.demo.ts"])
  })
})

describe("mapProjectFilesToPaths", () => {
  test("maps pipeline payload files to absolute paths", () => {
    const mapped = mapProjectFilesToPaths("/repo/project", [
      { path: "packages/api/src/a.test.ts", status: "created" },
      { path: "readme.md", status: "modified" },
    ])

    expect(mapped).toEqual([
      "/repo/project/packages/api/src/a.test.ts",
      "/repo/project/readme.md",
    ])
  })
})

describe("createRunnableWatcher", () => {
  test("runs direct runnable files and caches dependencies", async () => {
    const depsCalls: string[] = []
    const mochiCalls: string[][] = []
    const bashCalls: string[][] = []

    const watcher = createRunnableWatcher({
      collectDeps: async (entry) => {
        depsCalls.push(entry)
        return [entry, "/repo/shared.ts"]
      },
      runMochi: async (files) => {
        mochiCalls.push(files)
        return [{ files }]
      },
      runBash: async (cmd) => {
        bashCalls.push(cmd)
        return ok(cmd)
      },
    })

    const result = await watcher.processChangedFiles([
      "/repo/src/story.mochi.ts",
      "/repo/src/feature.test.ts",
      "/repo/src/showcase.demo.ts",
    ], "/repo")

    expect(mochiCalls).toEqual([["/repo/src/story.mochi.ts"]])
    expect(bashCalls).toEqual([
      ["bun", "test", "/repo/src/feature.test.ts"],
      ["bun", "run", "/repo/src/showcase.demo.ts"],
    ])
    expect(depsCalls).toEqual([
      "/repo/src/story.mochi.ts",
      "/repo/src/feature.test.ts",
      "/repo/src/showcase.demo.ts",
    ])

    expect(result.mochiFiles).toEqual(["/repo/src/story.mochi.ts"])
    expect(result.testFiles).toEqual(["/repo/src/feature.test.ts"])
    expect(result.demoFiles).toEqual(["/repo/src/showcase.demo.ts"])
    expect(watcher.getCachedRunnableFiles()).toEqual([
      "/repo/src/story.mochi.ts",
      "/repo/src/feature.test.ts",
      "/repo/src/showcase.demo.ts",
    ])
  })

  test("reruns cached runnable files when dependency files change", async () => {
    const bashCalls: string[][] = []

    const watcher = createRunnableWatcher({
      collectDeps: async (entry) => {
        if (entry === "/repo/src/math.test.ts") {
          return [entry, "/repo/src/math.ts"]
        }
        return [entry]
      },
      runMochi: async () => [],
      runBash: async (cmd) => {
        bashCalls.push(cmd)
        return ok(cmd)
      },
    })

    await watcher.processChangedFiles(["/repo/src/math.test.ts"], "/repo")
    const result = await watcher.processChangedFiles(["/repo/src/math.ts"], "/repo")

    expect(result.testFiles).toEqual(["/repo/src/math.test.ts"])
    expect(bashCalls).toEqual([
      ["bun", "test", "/repo/src/math.test.ts"],
      ["bun", "test", "/repo/src/math.test.ts"],
    ])
  })

  test("watch toggle disables dependency-triggered reruns", async () => {
    const bashCalls: string[][] = []

    const watcher = createRunnableWatcher({
      collectDeps: async (entry) => {
        if (entry === "/repo/src/math.test.ts") {
          return [entry, "/repo/src/math.ts"]
        }
        return [entry]
      },
      runMochi: async () => [],
      runBash: async (cmd) => {
        bashCalls.push(cmd)
        return ok(cmd)
      },
    })

    await watcher.processChangedFiles(["/repo/src/math.test.ts"], "/repo")
    watcher.setWatching(false)

    const depChange = await watcher.processChangedFiles(["/repo/src/math.ts"], "/repo")
    expect(depChange.testFiles).toEqual([])

    await watcher.processChangedFiles(["/repo/src/math.test.ts"], "/repo")

    expect(bashCalls).toEqual([
      ["bun", "test", "/repo/src/math.test.ts"],
      ["bun", "test", "/repo/src/math.test.ts"],
    ])
  })
})

function ok(cmd: string[]): BashResult {
  return {
    stdout: "",
    stderr: "",
    exitCode: 0,
    cmd,
  }
}
