// @paladin/squire/src/shell/tempwriter.ts

import { homedir } from "os"
import { join, dirname } from "path"
import { mkdirSync } from "fs"
import type { IReporter } from "./reporter"

const TEMPWRITE_PATH = join(homedir(), ".cache", "paladin", "squire", "tempwrite.txt")

export class TempWriter {
  private _active = true
  readonly filePath = TEMPWRITE_PATH

  constructor(private reporter: IReporter) {}

  get active() {
    return this._active
  }

  toggle(): boolean {
    this._active = !this._active
    return this._active
  }

  private ensureDir() {
    mkdirSync(dirname(this.filePath), { recursive: true })
  }

  async clear() {
    this.ensureDir()
    await Bun.write(this.filePath, "")
  }

  async append(text: string) {
    this.ensureDir()
    const file = Bun.file(this.filePath)
    const existing = await file.exists() ? await file.text() : ""
    await Bun.write(this.filePath, existing + text)
  }

  async spawnSink(): Promise<"inherit" | "pipe"> {
    if (!this._active) return "inherit"
    await this.clear()
    return "pipe"
  }

  async captureOutput(proc: { stdout: ReadableStream<Uint8Array> | null }) {
    if (!this._active || !proc.stdout) return
    const text = await new Response(proc.stdout).text()
    await this.append(text)
  }

  async openInBrowser() {
    this.ensureDir()
    const exists = await Bun.file(this.filePath).exists()
    if (!exists) {
      await Bun.write(this.filePath, "")
    }

    const proc = Bun.spawn(["python3", "-m", "webbrowser", this.filePath], {
      stdout: "ignore",
      stderr: "ignore",
    })
    await proc.exited
    await this.clear()
  }
}
