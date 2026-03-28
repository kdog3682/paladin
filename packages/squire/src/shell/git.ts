// @paladin/squire/src/shell/git.ts

import type { VersionInfo } from "../core/version"
import { parseWipMessage } from "../core/version"

export type LogEntry = {
  hash: string
  message: string
}

export class GitOps {
  constructor(private cwd: string) {}

  private async exec(args: string[]): Promise<string> {
    const proc = Bun.spawn(["git", ...args], {
      cwd: this.cwd,
      stdout: "pipe",
      stderr: "pipe",
    })
    const output = await new Response(proc.stdout).text()
    const exitCode = await proc.exited
    if (exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text()
      throw new Error(`git ${args[0]} failed: ${stderr.trim()}`)
    }
    return output.trim()
  }

  async log(grep?: string): Promise<LogEntry[]> {
    const args = ["log", "--oneline", "--format=%H %s"]
    if (grep) args.push(`--grep=${grep}`)
    const output = await this.exec(args)
    if (!output) return []
    return output.split("\n").map(line => {
      const spaceIdx = line.indexOf(" ")
      return {
        hash: line.slice(0, spaceIdx),
        message: line.slice(spaceIdx + 1),
      }
    })
  }

  async wipHistory(pkg: string): Promise<VersionInfo[]> {
    const entries = await this.log(`wip(${pkg})`)
    return entries
      .map(e => {
        const parsed = parseWipMessage(e.message)
        if (!parsed) return null
        return { ...parsed, hash: e.hash }
      })
      .filter((e): e is VersionInfo => e !== null)
  }

  async add(paths: string[]): Promise<void> {
    await this.exec(["add", ...paths])
  }

  async commit(message: string): Promise<string> {
    return this.exec(["commit", "-m", message])
  }

  async restore(hash: string, paths: string[]): Promise<void> {
    await this.exec(["restore", "--source", hash, "--", ...paths])
  }

  async diff(paths: string[]): Promise<string> {
    return this.exec(["diff", "--name-only", ...paths])
  }

  async dirtyFiles(paths: string[]): Promise<string[]> {
    const output = await this.exec(["status", "--porcelain", ...paths])
    if (!output) return []
    return output.split("\n").map(l => l.trim().split(/\s+/).pop()!)
  }
}
