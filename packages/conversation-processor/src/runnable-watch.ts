// @paladin/conversation-processor/runnable-watch.ts

import { join } from "path"
import { mochi } from "@paladin/mochi"
import { bash } from "@paladin/utils/bash"
import type { BashResult } from "@paladin/utils/bash"
import { collectDependencies } from "@paladin/code-analysis"
import type { ProjectFile } from "./types"

type DependencyCollector = (entryFile: string, packageRoot: string) => Promise<string[]>
type MochiRunner = (files: string[]) => Promise<unknown[]>
type BashRunner = (cmd: string[], opts?: { cwd?: string }) => Promise<BashResult>

const MOCHI_PATTERN = /\.mochi\./
const DEMO_PATTERN = /\.demo\./
const TEST_PATTERN = /\.test\.|\.spec\.|\.e2e\.|\.unit\./

export type RunnableBuckets = {
  mochiFiles: string[]
  testFiles: string[]
  demoFiles: string[]
}

export type RunnableExecutionResult = RunnableBuckets & {
  mochiResults: unknown[]
  testResults: BashResult[]
  demoResults: BashResult[]
}

export type RunnableWatcher = {
  processChangedFiles(changedFiles: string[], packageRoot: string): Promise<RunnableExecutionResult>
  setWatching(enabled: boolean): void
  isWatching(): boolean
  getCachedRunnableFiles(): string[]
}

type CacheEntry = {
  deps: Set<string>
}

type RunnableWatcherOptions = {
  watchEnabled?: boolean
  collectDeps?: DependencyCollector
  runMochi?: MochiRunner
  runBash?: BashRunner
}

export function mapProjectFilesToPaths(rootDir: string, files: ProjectFile[]): string[] {
  return files.map(file => join(rootDir, file.path))
}

export function splitRunnableFiles(paths: string[]): RunnableBuckets {
  const mochiFiles: string[] = []
  const testFiles: string[] = []
  const demoFiles: string[] = []

  for (const file of paths) {
    if (isMochiFile(file)) {
      mochiFiles.push(file)
      continue
    }

    if (isTestLikeFile(file)) {
      testFiles.push(file)
      continue
    }

    if (isDemoFile(file)) {
      demoFiles.push(file)
    }
  }

  return { mochiFiles, testFiles, demoFiles }
}

export function createRunnableWatcher(options: RunnableWatcherOptions = {}): RunnableWatcher {
  const collectDeps = options.collectDeps ?? collectDependencies
  const runMochi = options.runMochi ?? mochi
  const runBash = options.runBash ?? bash
  let watchEnabled = options.watchEnabled ?? true
  const cache = new Map<string, CacheEntry>()

  return {
    async processChangedFiles(changedFiles, packageRoot) {
      const directRunnableFiles = changedFiles.filter(isRunnableFile)
      const toRun = new Set(directRunnableFiles)

      if (watchEnabled) {
        for (const changedFile of changedFiles) {
          if (isRunnableFile(changedFile)) continue

          for (const [entryFile, entry] of cache) {
            if (entry.deps.has(changedFile)) {
              toRun.add(entryFile)
            }
          }
        }
      }

      const runList = [...toRun]
      const buckets = splitRunnableFiles(runList)
      const mochiResults = buckets.mochiFiles.length
        ? await runMochi(buckets.mochiFiles)
        : []

      const testResults: BashResult[] = []
      if (buckets.testFiles.length) {
        const result = await runBash(["bun", "test", ...buckets.testFiles], { cwd: packageRoot })
        testResults.push(result)
      }

      const demoResults: BashResult[] = []
      for (const demoFile of buckets.demoFiles) {
        const result = await runBash(["bun", "run", demoFile], { cwd: packageRoot })
        demoResults.push(result)
      }

      for (const entryFile of runList) {
        const deps = await safeCollectDeps(collectDeps, entryFile, packageRoot)
        cache.set(entryFile, { deps: new Set(deps) })
      }

      return {
        ...buckets,
        mochiResults,
        testResults,
        demoResults,
      }
    },

    setWatching(enabled) {
      watchEnabled = enabled
    },

    isWatching() {
      return watchEnabled
    },

    getCachedRunnableFiles() {
      return [...cache.keys()]
    },
  }
}

function isRunnableFile(path: string): boolean {
  return isMochiFile(path) || isTestLikeFile(path) || isDemoFile(path)
}

function isMochiFile(path: string): boolean {
  return MOCHI_PATTERN.test(path)
}

function isDemoFile(path: string): boolean {
  return DEMO_PATTERN.test(path)
}

function isTestLikeFile(path: string): boolean {
  return TEST_PATTERN.test(path)
}

async function safeCollectDeps(
  collectDeps: DependencyCollector,
  entryFile: string,
  packageRoot: string,
): Promise<string[]> {
  try {
    return await collectDeps(entryFile, packageRoot)
  } catch {
    return [entryFile]
  }
}
