// @paladin/api/src/vcs.ts

import { $ } from "bun"
import { stat, mkdir } from "fs/promises"
import type { GitStatusEntry } from "@paladin/types"

export class GitRepo {
  constructor(public readonly directory: string) {}

  private run(...args: string[]) {
    return $`git -C ${this.directory} ${args}`
  }

  async exists(): Promise<boolean> {
    try {
      await stat(`${this.directory}/.git`)
      return true
    } catch {
      return false
    }
  }

  async init(): Promise<void> {
    await mkdir(this.directory, { recursive: true })
    await $`git init ${this.directory}`
  }

  async status(): Promise<GitStatusEntry[]> {
    const raw = await this.run("status", "--porcelain").text()
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

  async branch() {
    return (await this.run("branch", "--show-current").text()).trim()
  }

  async commit(message: string) {
    await this.run("commit", "-m", message)
  }

  async add(...files: string[]) {
    if (files.length === 0) files = ["."]
    await this.run("add", ...files)
  }

  async stage(...files: string[]) {
    await this.add(...files)
  }

  async unstage(...files: string[]) {
    await this.run("reset", "HEAD", "--", ...files)
  }

  async unstageAll() {
    await this.run("reset", "HEAD")
  }

  async log(count = 10) {
    const output = await this.run("log", "--oneline", "-n", String(count)).text()
    return output.trim().split("\n").filter(Boolean)
  }

  async diff(staged = false) {
    const args = staged ? ["diff", "--staged"] : ["diff"]
    return this.run(...args).text()
  }

  async checkout(...args: string[]) {
    await this.run("checkout", ...args)
  }

  async pull() {
    await this.run("pull")
  }

  async push() {
    await this.run("push")
  }

  async isClean() {
    const entries = await this.status()
    return entries.length === 0
  }

  async remoteUrl() {
    return (await this.run("remote", "get-url", "origin").text()).trim()
  }

  async root() {
    return (await this.run("rev-parse", "--show-toplevel").text()).trim()
  }
}
