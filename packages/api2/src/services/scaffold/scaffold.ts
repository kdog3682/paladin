import { createProject } from "./createProject"
import { persist } from "./persist"
import { postProcessors } from "./postProcessors"
import { resolveDependencies } from "./utils/resolveDependencies"
import { CodeRunner } from "./runner"
import { hydrateBoilerplate } from "./hydrateBoilerplate"
import { GitService } from "../git"
import { dispatch } from "./commands"
import type { ScaffoldEmit } from "./events"
import type { RunOptions } from "./runner"
import type { Project, ScaffoldOptions } from "./types"

export interface ScaffoldServiceOptions {
  pathResolution?: ScaffoldOptions
  emit?: ScaffoldEmit
  codeRunner?: RunOptions
  git?: { init?: boolean }
}

export class ScaffoldService {
  readonly sessions: Project[] = []

  private codeRunner = new CodeRunner()
  private git = new GitService()
  private emit: ScaffoldEmit

  constructor(private opts: ScaffoldServiceOptions = {}) {
    this.opts = { ...opts, pathResolution: opts.pathResolution ?? {} }
    this.emit = opts.emit ?? console.log
  }

  setOptions(opts: Partial<ScaffoldServiceOptions>) {
    this.opts = { ...this.opts, ...opts }
    if (opts.emit) this.emit = opts.emit
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
    await resolveDependencies(project, this.opts.pathResolution)

    this.emit("project", project)

    for (const unit of project.units) {
      const results = await this.codeRunner.run(unit.files, this.opts.codeRunner)
      this.emit("runResults", results)
    }

    this.sessions.push(project)

    if (this.opts.git?.init) {
      await this.git.init(project.dir)
    }
  }

  async dispatch(method: string, kwargs?: unknown) {
    return await dispatch(this, method, kwargs)
  }
}
