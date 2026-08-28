import { createProject } from "./createProject"
import { persist } from "./persist"
import { postProcessors } from "./postProcessors"
import { CodeRunner } from "./runner"
import { hydrateBoilerplate } from "./utils/hydrateBoilerplate"
import { GitService } from "../git"
import type { Registration } from "./runner"
import type { Project, ScaffoldOptions } from "./types"

export class ScaffoldService {
  readonly sessions: Project[] = []

  private codeRunner = new CodeRunner()
  private git = new GitService()
  private queue: Promise<unknown> = Promise.resolve()

  constructor(private opts: ScaffoldOptions = {}) {}

  register(registration: Registration): this {
    this.codeRunner.register(registration)
    return this
  }

  process(path: string): Promise<Project | null> {
    const next = this.queue.then(() => this.scaffold(path))
    this.queue = next.catch(() => {})
    return next
  }

  private async scaffold(path: string): Promise<Project | null> {
    const project = await createProject(path, this.opts.pathResolution)
    if (!project) return null

    for (const unit of project.units) {
      await persist(unit)
      for (const processor of postProcessors) await processor(unit)
      this.opts.emit?.({
        kind: "unit",
        unit: unit.name,
        dir: unit.dir,
        isNew: unit.isNew,
        files: unit.files,
      })
    }

    await hydrateBoilerplate(project)

    for (const unit of project.units) {
      const results = await this.codeRunner.run(unit.files, this.opts.codeRunner)
      for (const result of results) {
        this.opts.emit?.({ kind: "run", unit: unit.name, result })
      }
    }

    this.sessions.push(project)
    await this.git.init(project.dir)

    return project
  }
}
