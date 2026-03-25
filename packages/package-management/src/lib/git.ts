// @paladin/package-management/lib/git.ts

export class GitRepo {
  constructor(private root: string) {}

  private async run(args: string[]): Promise<string> {
    const proc = Bun.spawn(["git", ...args], {
      cwd: this.root,
      stdout: "pipe",
      stderr: "pipe",
    })

    const stdout = await new Response(proc.stdout).text()
    const stderr = await new Response(proc.stderr).text()
    const code = await proc.exited

    if (code !== 0) {
      throw new Error(`git ${args[0]} failed (${code}): ${stderr.trim()}`)
    }

    return stdout.trim()
  }

  async isClean(): Promise<boolean> {
    const status = await this.run(["status", "--porcelain"])
    return status.length === 0
  }

  async createTag(name: string, message: string): Promise<void> {
    await this.run(["tag", "-a", name, "-m", message])
  }

  async deleteTag(name: string): Promise<void> {
    await this.run(["tag", "-d", name])
  }

  async listTags(pattern: string): Promise<string[]> {
    const out = await this.run(["tag", "-l", pattern])
    if (!out) return []
    return out.split("\n").filter(Boolean)
  }

  async readTagMessage(tag: string): Promise<string> {
    return this.run(["tag", "-l", "--format=%(contents)", tag])
  }

  async showFile(ref: string, path: string): Promise<string> {
    return this.run(["show", `${ref}:${path}`])
  }

  async listTree(ref: string, path: string): Promise<string[]> {
    const out = await this.run([
      "ls-tree",
      "-r",
      "--name-only",
      ref,
      path,
    ])
    if (!out) return []
    return out.split("\n").filter(Boolean)
  }

  async add(paths: string[]): Promise<void> {
    await this.run(["add", ...paths])
  }

  async addAll(): Promise<void> {
    await this.run(["add", "-A"])
  }

  async commit(message: string): Promise<void> {
    await this.run(["commit", "-m", message])
  }

  async rm(paths: string[], recursive = false): Promise<void> {
    const flags = recursive ? ["-r"] : []
    await this.run(["rm", ...flags, ...paths])
  }
}
