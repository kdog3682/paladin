// @paladin/squire/src/shell/runner.ts

import type { IReporter } from "./reporter"
import type { TempWriter } from "./tempwriter"

export class Runner {
  constructor(
    private cwd: string,
    private reporter: IReporter,
    private tempWriter: TempWriter
  ) {}

  async runDemo(demoFile: string) {
    this.reporter.info(`running demo: ${demoFile}`)

    if (this.tempWriter.active) {
      await this.tempWriter.clear()
      await this.tempWriter.append(`--- demo: ${demoFile} ---\n\n`)
      const proc = Bun.spawn(["bun", "run", demoFile], {
        cwd: this.cwd,
        stdout: "pipe",
        stderr: "pipe",
      })
      await this.tempWriter.captureOutput(proc)
      const stderr = await new Response(proc.stderr).text()
      if (stderr) await this.tempWriter.append(`\n--- stderr ---\n${stderr}`)
      await proc.exited
    } else {
      const proc = Bun.spawn(["bun", "run", demoFile], {
        cwd: this.cwd,
        stdout: "inherit",
        stderr: "inherit",
      })
      await proc.exited
    }
  }

  async runTests(testFiles: string[]) {
    if (testFiles.length === 0) {
      this.reporter.warn("no test files matched")
      return
    }
    this.reporter.info(`running ${testFiles.length} test(s)`)

    if (this.tempWriter.active) {
      await this.tempWriter.clear()
      await this.tempWriter.append(`--- test: ${testFiles.join(", ")} ---\n\n`)
      const proc = Bun.spawn(["bun", "test", ...testFiles], {
        cwd: this.cwd,
        stdout: "pipe",
        stderr: "pipe",
      })
      await this.tempWriter.captureOutput(proc)
      const stderr = await new Response(proc.stderr).text()
      if (stderr) await this.tempWriter.append(`\n--- stderr ---\n${stderr}`)
      await proc.exited
    } else {
      const proc = Bun.spawn(["bun", "test", ...testFiles], {
        cwd: this.cwd,
        stdout: "inherit",
        stderr: "inherit",
      })
      await proc.exited
    }
  }
}
