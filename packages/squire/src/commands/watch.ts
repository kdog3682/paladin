// @paladin/squire/src/commands/watch.ts

import { matchTestFiles, findDemoFile } from "../core/matcher"
import { cacheDeps } from "../shell/deps"
import { PkgWatcher } from "../shell/watcher"
import type { Runner } from "../shell/runner"
import type { IReporter } from "../shell/reporter"
import { readdir } from "fs/promises"
import { join } from "path"

async function collectFiles(dir: string): Promise<string[]> {
  const out: string[] = []
  const entries = await readdir(dir, { withFileTypes: true, recursive: true })
  for (const e of entries) {
    if (!e.isFile()) continue
    out.push(join(dir, e.name))
  }
  return out
}

export function createWatcher(
  pkgDir: string,
  runner: Runner,
  reporter: IReporter,
  getState: () => { demo: boolean, test: boolean, testPattern?: string }
) {
  let debounce: ReturnType<typeof setTimeout> | null = null

  const watcher = new PkgWatcher(pkgDir, () => {
    if (debounce) clearTimeout(debounce)
    debounce = setTimeout(async () => {
      const state = getState()
      reporter.info("file change detected")

      const deps = await cacheDeps(pkgDir)
      reporter.info(`cached ${deps.length} external deps`)

      const files = await collectFiles(pkgDir)

      if (state.demo) {
        const demoFile = findDemoFile(files)
        if (demoFile) await runner.runDemo(demoFile)
        else reporter.warn("no .demo.ts file found")
      }

      if (state.test) {
        const matched = matchTestFiles(files, state.testPattern)
        await runner.runTests(matched)
      }
    }, 200)
  })

  return watcher
}
