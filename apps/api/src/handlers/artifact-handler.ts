// @paladin/api/src/handlers/artifact-handler.ts

import { watch } from "fs"
import { readFile, writeFile, mkdir, rename, stat, rm } from "fs/promises"
import { dirname, join } from "path"
import { homedir } from "os"
import type { WebSocketServer } from "../server"
import type { Artifact, Conversation, RunResult, FileInfo } from "@paladin/types"
import { GitRepo } from "../vcs"
import { resolvePath, toAliasedPath, parsePathFromComment, extractOrg } from "../utils/path-ops"
import { runTests } from "../run-tests"
import { importRewriter } from "@paladin/tooling/codemods/import-rewriter"
import { gitCommit } from "@paladin/ai"
import { scaffoldProject } from "../scaffold-project"
import { ensureBunPackageDependencies } from "../hooks/ensure-bun-package-dependencies"

type HookEvent = { event: string; data: Record<string, unknown> }
type AfterAllHook = (artifacts: Artifact[], org: string, repo: GitRepo) => Promise<HookEvent | null>

const RUNNERS: Record<string, (files: string[]) => Promise<RunResult>> = {
  ".test.ts": runTests,
  ".test.tsx": runTests,
}

function matchSuffix(path: string, patterns: Record<string, unknown>): string | null {
  const sorted = Object.keys(patterns).sort((a, b) => b.length - a.length)
  for (const p of sorted) {
    if (path.endsWith(p)) return p
  }
  return null
}
import { stat } from "fs/promises"

export async function waitForStableFile(
  path: string,
  { interval = 50, timeout = 2000 } = {}
): Promise<void> {
  let lastSize = -1
  const start = Date.now()

  while (Date.now() - start < timeout) {
    try {
      const s = await stat(path)
      if (s.size > 0 && s.size === lastSize) return
      lastSize = s.size
    } catch {}
    await Bun.sleep(interval)
  }
}

export class ArtifactHandler {
  private seen = new Set<string>()
  private artifacts = new Map<string, Artifact>()
  private git!: GitRepo
  private watchDir = ""
  private autoWriteFiles: boolean
  private afterAllHooks: AfterAllHook[]
  private projectName = ""

  constructor(
    private server: WebSocketServer,
    private options: { autoWriteFiles?: boolean; afterAllHooks?: AfterAllHook[] } = {}
  ) {
    this.autoWriteFiles = options.autoWriteFiles ?? true
    this.afterAllHooks = options.afterAllHooks ?? [
      (artifacts, org) => ensureBunPackageDependencies(artifacts, org),
    ]
  }

  init(): void {
    this.server
      .onMessage("setProject", (d) => this.setProject(d.project as string))
      .onMessage("getGitStatus", () => this.sendGitStatus())
      .onMessage("stageFile", (d) => this.stageFile(d.file as string))
      .onMessage("stageFiles", (d) => this.stageFiles(d.files as string[]))
      .onMessage("unstageFile", (d) => this.unstageFile(d.file as string))
      .onMessage("unstageAll", () => this.unstageAll())
      .onMessage("renameFile", (d) => this.renameFile(d.id as string, d.newPath as string))
      .onMessage("commitFile", (d) => this.commitFile(d.id as string))
      .onMessage("commitFiles", (d) => this.commitFiles(d.files as string[]))
      .onMessage("discardFile", (d) => this.discardFile(d.id as string))
      .onMessage("getFileInfo", (d) => this.sendFileInfo(d.id as string))
      .onMessage("getFileHistory", (d) => this.sendFileHistory(d.id as string))
  }

  setWatchDir(dir: string): void {
    this.watchDir = dir
    this.startWatcher()
  }

  // ── Implicit project ─────────────────────────────────────

  private detectImplicitProject(modified: Artifact[]): string | null {
    const orgs = new Set<string>()
    for (const a of modified) {
      if (!a.aliasedPath) continue
      const org = extractOrg(a.aliasedPath)
      if (org) orgs.add(org)
    }
    if (orgs.size === 1) {
      const org = [...orgs][0]
      if (org !== this.projectName) return org
    }
    return null
  }

  // ── Watcher ──────────────────────────────────────────────

  private startWatcher(): void {
    watch(this.watchDir, async (event, filename) => {
      if (event !== "rename" || !filename) return
      const ext = filename.split(".").pop()
      if (!ext) return

      const filepath = join(this.watchDir, filename)

      if (ext === "json") await this.handleJsonFile(filepath)
      else if (["ts", "tsx", "py"].includes(ext)) await this.handleCodeFile(await readFile(filepath, "utf-8"), filename)
    })
    console.log(`Watching ${this.watchDir}`)
  }

  private async handleJsonFile(filepath: string): Promise<void> {
  await waitForStableFile(filepath)
  const content = await readFile(filepath, "utf-8")
  try {
    const modified = this.processConversation(JSON.parse(content))
    if (modified.length > 0) {
        this.maybeSetImplicitProject(modified)
        this.server.broadcast({ type: "artifactsModified", artifacts: modified })
        if (this.autoWriteFiles) await this.writeFiles(modified)
      }
  } catch (e) {
    console.error("JSON parse error — first 200 chars:", content.slice(0, 200))
    console.error(e)
  }
}

  private async handleCodeFile(content: string, filename: string): Promise<void> {
    const pathFromComment = parsePathFromComment(content)
    const path = pathFromComment ? resolvePath(pathFromComment) : null
    const aliasedPath = pathFromComment ?? null
    const existingId = this.findArtifactByPath(path)
    let modified: Artifact[]

    if (existingId) {
      const artifact = this.artifacts.get(existingId)!
      artifact.content = content
      artifact.status = "modified"
      modified = [artifact]
    } else {
      const status = path && await this.existsOnDisk(path) ? "modified" : "created"
      const id = `file-${filename}-${Date.now()}`
      const artifact: Artifact = {
        id, title: filename, content,
        language: filename.endsWith(".py") ? "python" : "typescript",
        path, aliasedPath, status,
      }
      this.artifacts.set(id, artifact)
      modified = [artifact]
    }

    this.maybeSetImplicitProject(modified)
    this.server.broadcast({ type: "artifactsModified", artifacts: modified })
    if (this.autoWriteFiles) await this.writeFiles(modified)
  }

  private maybeSetImplicitProject(modified: Artifact[]): void {
    const org = this.detectImplicitProject(modified)
    if (org) {
      this.setProject(org)
      this.server.broadcast({ type: "projectList", projects: [] }) // trigger refresh
    }
  }

  // ── Git ──────────────────────────────────────────────────

  async sendGitStatus(): Promise<void> {
    if (!this.git) return
    const entries = await this.git.status()
    this.server.broadcast({ type: "gitStatus", entries })
  }

  private async stageFile(file: string): Promise<void> {
    await this.git.stage(file)
    await this.sendGitStatus()
  }

  private async stageFiles(files: string[]): Promise<void> {
    await this.git.stage(...files)
    await this.sendGitStatus()
  }

  private async unstageFile(file: string): Promise<void> {
    await this.git.unstage(file)
    await this.sendGitStatus()
  }

  private async unstageAll(): Promise<void> {
    await this.git.unstageAll()
    await this.sendGitStatus()
  }

  // ── Project ──────────────────────────────────────────────

  private setProject(name: string): void {
    this.projectName = name
    const projectDir = join(homedir(), "projects", name)
    this.git = new GitRepo(projectDir)
    this.artifacts.clear()
    this.seen.clear()
  }

  // ── Artifact CRUD ────────────────────────────────────────

  private findArtifactByPath(path: string | null): string | null {
    if (!path) return null
    for (const [id, a] of this.artifacts) {
      if (a.path === path) return id
    }
    return null
  }

  private existsOnDisk(path: string): Promise<boolean> {
    return stat(path).then(() => true).catch(() => false)
  }

  private processConversation(conversation: Conversation): Artifact[] {
    const modified: Artifact[] = []
    for (const msg of conversation.messages) {
      if (msg.sender !== "assistant" || this.seen.has(msg.uuid)) continue
      this.seen.add(msg.uuid)

      for (const block of msg.content) {
        if (block.type !== "tool_use" || block.name !== "artifacts" || !block.input) continue
        const { command, id, title, content, language, old_str, new_str } = block.input

        if (command === "create") {
          const p = parsePathFromComment(content)
          const path = p ? resolvePath(p) : null
          const artifact: Artifact = {
            id, title, content, language,
            path, aliasedPath: p ?? null, status: "created",
          }
          if (path) {
            this.existsOnDisk(path).then((exists) => {
              artifact.status = exists ? "modified" : "created"
            })
          }
          this.artifacts.set(id, artifact)
          modified.push(artifact)
        } else if (command === "rewrite") {
          const artifact = this.artifacts.get(id)
          if (artifact) {
            artifact.content = content
            const p = parsePathFromComment(content)
            if (p) { artifact.path = resolvePath(p); artifact.aliasedPath = p }
            artifact.status = "modified"
            modified.push(artifact)
          }
        } else if (command === "update") {
          const artifact = this.artifacts.get(id)
          if (artifact) {
            artifact.content = artifact.content.replace(old_str, new_str)
            artifact.status = "modified"
            modified.push(artifact)
          }
        }
      }
    }
    return modified
  }

  // ── File operations ──────────────────────────────────────

  async renameFile(id: string, aliasedPath: string): Promise<void> {
    const artifact = this.artifacts.get(id)
    if (!artifact) return
    const newPath = resolvePath(aliasedPath)
    if (!newPath) return
    const oldPath = artifact.path

    if (oldPath && await this.existsOnDisk(oldPath)) {
      await mkdir(dirname(newPath), { recursive: true })
      await rename(oldPath, newPath)
      await importRewriter(oldPath, newPath, this.git.directory)
    }

    artifact.path = newPath
    artifact.aliasedPath = aliasedPath
    this.server.broadcast({ type: "fileMoved", artifactId: id, newPath, aliasedPath })
    await this.sendGitStatus()
  }

  async commitFile(id: string): Promise<void> {
    const artifact = this.artifacts.get(id)
    if (!artifact?.path) return
    this.server.broadcast({ type: "commitStarted", files: [artifact.path] })

    await this.git.add(artifact.path)
    const message = await gitCommit({
      files: [artifact.path], repo: this.git,
      options: { length: "short", conventionalCommit: true },
    })
    await this.git.commit(message)
    artifact.status = "committed"

    this.server.broadcast({ type: "commitCreated", output: message })
    this.server.broadcast({ type: "artifactsModified", artifacts: [artifact] })
    await this.sendGitStatus()
  }

  async commitFiles(files: string[]): Promise<void> {
    this.server.broadcast({ type: "commitStarted", files })
    await this.git.add(...files)
    const message = await gitCommit({
      files, repo: this.git,
      options: { length: "short", conventionalCommit: true },
    })
    await this.git.commit(message)

    for (const f of files) {
      const id = this.findArtifactByPath(f)
      if (id) this.artifacts.get(id)!.status = "committed"
    }

    this.server.broadcast({ type: "commitCreated", output: message })
    await this.sendGitStatus()
  }

  async discardFile(id: string): Promise<void> {
    const artifact = this.artifacts.get(id)
    if (!artifact?.path) return
    try { await this.git.checkout("--", artifact.path) }
    catch { await rm(artifact.path, { force: true }) }
    this.artifacts.delete(id)
    await this.sendGitStatus()
  }

  async sendFileInfo(id: string): Promise<void> {
    const artifact = this.artifacts.get(id)
    if (!artifact?.path) return
    const loc = artifact.content.split("\n").length
    let createdAt: string | null = null, modifiedAt: string | null = null
    try {
      const s = await stat(artifact.path)
      createdAt = s.birthtime.toISOString()
      modifiedAt = s.mtime.toISOString()
    } catch {}
    this.server.broadcast({ type: "fileInfo", artifactId: id, info: { loc, fullPath: artifact.path, createdAt, modifiedAt } })
  }

  async sendFileHistory(id: string): Promise<void> {
    const artifact = this.artifacts.get(id)
    if (!artifact?.path) return
    const history = await this.git.log(artifact.path)
    this.server.broadcast({ type: "fileHistory", artifactId: id, history })
  }

  // ── Write pipeline ──────────────────────────────────────

  async writeFiles(modified: Artifact[]): Promise<void> {
    const toWrite = modified.filter((a) => a.path && (a.status === "created" || a.status === "modified"))
    if (toWrite.length === 0) return

    // Scaffold if needed
    const scaffoldResult = await scaffoldProject(this.git, this.projectName)
    if (scaffoldResult) {
      this.server.broadcast({ type: scaffoldResult.event, ...scaffoldResult.data } as any)
    }

    const written: string[] = []
    for (const artifact of toWrite) {
      await mkdir(dirname(artifact.path!), { recursive: true })
      await writeFile(artifact.path!, artifact.content)
      written.push(artifact.path!)
    }

    this.server.broadcast({ type: "filesWritten", artifacts: toWrite, paths: written })

    // Run matching runners
    for (const artifact of toWrite) {
      const key = matchSuffix(artifact.path!, RUNNERS)
      if (key) {
        const result = await RUNNERS[key]([artifact.path!])
        artifact.runResult = result
        this.server.broadcast({ type: "runResult", artifactId: artifact.id, result })
      }
    }

    // After all hooks
    for (const hook of this.afterAllHooks) {
      const event = await hook(toWrite, this.projectName, this.git)
      if (event) {
        this.server.broadcast({ type: event.event, ...event.data } as any)
      }
    }

    await this.sendGitStatus()
  }
}
