// @paladin/squire/src/shell/runner.ts

import type { IReporter } from "./reporter"
import type { TempWriter } from "./tempwriter"

export class Runner {
  constructor(
    private cwd: string,
    private reporter: IReporter,
    private tempWriter: TempWriter
  ) {}

  private async spawn(args: string[], cwd?: string) {
    const dir = cwd ?? this.cwd

    if (this.tempWriter.active) {
      await this.tempWriter.clear()
      await this.tempWriter.append(`--- ${args.join(" ")} ---\n\n`)
      const proc = Bun.spawn(args, {
        cwd: dir,
        stdout: "pipe",
        stderr: "pipe",
      })
      await this.tempWriter.captureOutput(proc)
      const stderr = await new Response(proc.stderr).text()
      if (stderr) await this.tempWriter.append(`\n--- stderr ---\n${stderr}`)
      await proc.exited
    } else {
      const proc = Bun.spawn(args, {
        cwd: dir,
        stdout: "inherit",
        stderr: "inherit",
      })
      await proc.exited
    }
  }

  async runDemo(demoFile: string) {
    this.reporter.info(`running demo: ${demoFile}`)
    await this.spawn(["bun", "run", demoFile])
  }

  async runTests(testFiles: string[], pkgDir?: string) {
    if (testFiles.length === 0) {
      this.reporter.warn("no test files matched")
      return
    }
    this.reporter.info(`running ${testFiles.length} test(s)`)
    for (const file of testFiles) {
      this.reporter.info(file)
      await this.spawn(["bun", file], pkgDir)
    }
  }
}
