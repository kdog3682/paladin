import { createProject } from "./createProject"
import { persist } from "./persist"
import { postProcessors } from "./postProcessors"
import { resolveDependencies } from "./resolveDependencies"
import { CodeRunner } from "./runner"
import { hydrateBoilerplate } from "./hydrateBoilerplate"
import { GitService } from "../git"
import type { ScaffoldEmit } from "./events"
import type { Registration } from "./runner"
import type { Project, ScaffoldOptions } from "./types"

export class ScaffoldService {
  readonly sessions: Project[] = []

  private codeRunner = new CodeRunner()
  private git = new GitService()
  private emit: ScaffoldEmit

  constructor(private opts: ScaffoldOptions = {}) {
    this.emit = opts.emit ?? console.log
  }

  async process(input: string) {
    const project = await createProject(input, this.opts.pathResolution)
    if (!project) return

    for (const unit of project.units) {
      await persist(unit)
      for (const processor of postProcessors) {
        const processResult = await processor(unit)
        this.emit("processResult", processResult)
      }
    }

    await hydrateBoilerplate(project)
    await resolveDependencies(project)

    this.emit("project", project)

    for (const unit of project.units) {
      const results = await this.codeRunner.run(unit.files, this.opts.codeRunner)
      this.emit("runResults", results)
    }

    this.sessions.push(project)

    if (this.opts.git.init) {
      await this.git.init(project.dir)
    }
  }
}
