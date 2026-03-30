// @paladin/squire/src/shell/watcher.ts

import { watch } from "fs"
import { join } from "path"
import { collectSrc, discover } from "../utils/files"
import { cacheDeps } from "../shell/deps"
import type { Runner } from "../shell/runner"
import type { IReporter } from "../shell/reporter"

export type WatchState = {
  demo: boolean
  test: boolean
  mochi: boolean
}

async function execute(
  pkgDir: string,
  runner: Runner,
  reporter: IReporter,
  state: WatchState,
  filters?: string[]
) {
  await runner.clearOutput()

  const deps = await cacheDeps(pkgDir)
  reporter.info(`cached ${deps.length} external deps`)

  const files = await collectSrc(pkgDir)

  if (state.demo) {
    const demos = discover(files, "demo", filters)
    if (demos.length) await runner.runDemos(demos)
    else reporter.warn("no .demo.ts files found")
  }

  if (state.test) {
    const tests = discover(files, "test", filters)
    await runner.runTests(tests)
  }

  if (state.mochi) {
    const mochis = discover(files, "mochi", filters)
    await runner.runMochi(mochis)
  }
}

export class PkgWatcher {
  private abortController: AbortController | null = null
  private debounce: ReturnType<typeof setTimeout> | null = null

  constructor(
    private pkgDir: string,
    private runner: Runner,
    private reporter: IReporter,
    private getState: () => WatchState
  ) {}

  async runNow(stateOverride?: WatchState, filters?: string[]) {
    const state = stateOverride ?? this.getState()
    await execute(this.pkgDir, this.runner, this.reporter, state, filters)
  }

  start() {
    if (this.abortController) return
    this.abortController = new AbortController()

    watch(
      join(this.pkgDir, "src"),
      { recursive: true, signal: this.abortController.signal },
      (event, filename) => {
        if (!filename) return
        if (event === "rename") return

        if (this.debounce) clearTimeout(this.debounce)
        this.debounce = setTimeout(() => {
          this.reporter.info("file change detected")
          this.runNow().catch((err) => {
            this.reporter.error(`run failed: ${err.message}`)
          })
        }, 200)
      }
    )
  }

  stop() {
    if (this.debounce) {
      clearTimeout(this.debounce)
      this.debounce = null
    }
    this.abortController?.abort()
    this.abortController = null
  }

  get active() {
    return this.abortController !== null
  }
}
