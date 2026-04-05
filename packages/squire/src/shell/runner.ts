// @paladin/squire/src/shell/runner.ts

import { mochi } from "@paladin/mochi"
import { tempwrite } from "@paladin/utils/tempwrite"
import type { IReporter } from "./reporter"

export class Runner {
  constructor(
    private cwd: string,
    private reporter: IReporter,
  ) {}

  private async capture(args: string[], cwd?: string): Promise<string> {
    const dir = cwd ?? this.cwd
    const proc = Bun.spawn(args, {
      cwd: dir,
      stdout: "pipe",
      stderr: "pipe",
    })
    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ])
    await proc.exited
    return stderr ? `${stdout}\n--- stderr ---\n${stderr}` : stdout
  }

  async runDemos(demoFiles: string[]) {
    if (demoFiles.length === 0) {
      this.reporter.warn("no demo files matched")
      return
    }
    this.reporter.info(`running ${demoFiles.length} demo(s)`)
    const parts: string[] = []
    for (const file of demoFiles) {
      this.reporter.info(file)
      const out = await this.capture(["bun", "run", file])
      parts.push(`--- ${file} ---\n\n${out}`)
    }
    await tempwrite(parts.join("\n\n"))
  }

  async runMochi(mochiFiles: string[]) {
    if (mochiFiles.length === 0) {
      this.reporter.warn("no mochi files matched")
      return
    }
    this.reporter.info(`running ${mochiFiles.length} mochi file(s)`)
    const result = await mochi(mochiFiles)
    await tempwrite(result)
  }

  async runTests(testFiles: string[], pkgDir?: string) {
    if (testFiles.length === 0) {
      this.reporter.warn("no test files matched")
      return
    }
    this.reporter.info(`running ${testFiles.length} test(s)`)
    const parts: string[] = []
    for (const file of testFiles) {
      this.reporter.info(file)
      const out = await this.capture(["bun", "test", file], pkgDir)
      parts.push(`--- ${file} ---\n\n${out}`)
    }
    await tempwrite(parts.join("\n\n"))
  }

}
