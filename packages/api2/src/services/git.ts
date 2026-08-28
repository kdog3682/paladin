import { existsSync } from "node:fs"
import { join, resolve } from "node:path"
import { bash } from "@paladin/utils"

export class GitService {
  private cwd = process.cwd()

  setDir(dir: string) {
    this.cwd = resolve(dir)
  }

  async init(dir?: string) {
    if (dir) this.setDir(dir)
    if (existsSync(join(this.cwd, ".git"))) return

    await this.run("init")
  }

  private async run(...args: string[]) {
    const { stdout } = await bash(["git", ...args], { cwd: this.cwd, strict: true })
    return stdout.trim()
  }

  async add(...paths: string[]) {
    await this.run("add", "--", ...(paths.length ? paths : ["."]))
  }

  async commit(message: string) {
    await this.run("commit", "-m", message)
    return this.run("rev-parse", "HEAD")
  }

  async createBranch(name: string) {
    await this.run("switch", "-c", name)
    return name
  }

  async getRemote() {
    return await this.run("remote", "get-url", "origin")
  }

  async getBranch() {
    return await this.run("branch", "--show-current")
  }

  async push() {
    await this.run("push", "-u", "origin", await this.getBranch())
  }

  async pull() {
    await this.run("pull")
  }
}
