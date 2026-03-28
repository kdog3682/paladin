// @paladin/squire/src/shell/watcher.ts

import { watch } from "fs"
import { join } from "path"

export type WatchHandler = (filePath: string) => void

export class PkgWatcher {
  private abortController: AbortController | null = null

  constructor(
    private pkgDir: string,
    private onChange: WatchHandler
  ) {}

  start() {
    if (this.abortController) return
    this.abortController = new AbortController()

    watch(
      this.pkgDir,
      { recursive: true, signal: this.abortController.signal },
      (_event, filename) => {
        if (!filename) return
        if (filename.includes("node_modules")) return
        if (filename.includes(".git")) return
        this.onChange(join(this.pkgDir, filename))
      }
    )
  }

  stop() {
    this.abortController?.abort()
    this.abortController = null
  }

  get active() {
    return this.abortController !== null
  }
}
