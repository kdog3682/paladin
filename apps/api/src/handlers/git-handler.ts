// @paladin/api/src/handlers/git-handler.ts

import type { WebSocketServer } from "../server"
import type { GitStatusEntry } from "@paladin/types"
import { GitRepo } from "../vcs"

export class GitHandler {
  private git!: GitRepo

  constructor(private server: WebSocketServer) {}

  init(): void {
    this.server
      .onMessage("getGitStatus", () => this.sendGitStatus())
      .onMessage("stageFile", (data) => this.stageFile(data.file as string))
      .onMessage("stageFiles", (data) => this.stageFiles(data.files as string[]))
      .onMessage("unstageFile", (data) => this.unstageFile(data.file as string))
      .onMessage("unstageAll", () => this.unstageAll())
  }

  setRepo(git: GitRepo): void {
    this.git = git
  }

  async sendGitStatus(): Promise<void> {
    const raw = await this.git.status()
    const entries = this.parseStatus(raw)
    this.server.broadcast({ type: "gitStatus", entries })
  }

  private parseStatus(raw: string): GitStatusEntry[] {
    const entries: GitStatusEntry[] = []

    for (const line of raw.split("\n").filter(Boolean)) {
      const index = line[0]
      const worktree = line[1]
      const path = line.slice(3).trim()

      if (index !== " " && index !== "?") {
        entries.push({ path, relativePath: path, status: "staged" })
      } else if (worktree === "M" || worktree === "D") {
        entries.push({ path, relativePath: path, status: "modified" })
      } else if (index === "?" && worktree === "?") {
        entries.push({ path, relativePath: path, status: "untracked" })
      }
    }

    return entries
  }

  private async stageFile(file: string): Promise<void> {
    await this.git.add(file)
    await this.sendGitStatus()
  }

  private async stageFiles(files: string[]): Promise<void> {
    await this.git.add(...files)
    await this.sendGitStatus()
  }

  private async unstageFile(file: string): Promise<void> {
    const { $ } = await import("bun")
    await $`git -C ${this.git.directory} reset HEAD -- ${file}`.quiet()
    await this.sendGitStatus()
  }

  private async unstageAll(): Promise<void> {
    const { $ } = await import("bun")
    await $`git -C ${this.git.directory} reset HEAD`.quiet()
    await this.sendGitStatus()
  }
}
