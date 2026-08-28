import { GitService } from "../git"
import { applyOperations } from "./apply"
import { dispatch } from "./commands"
import { resolveDependencies } from "./deps/resolveDependencies"
import { VersionCache } from "./deps/versions"
import { defaultEmit } from "./emit"
import { hydrateBoilerplate } from "./hydrateBoilerplate"
import { plan } from "./plan/plan"
import { postProcessors } from "./postProcessors"
import { CodeRunner } from "./runner"
import type { ScaffoldEmit } from "./emit"
import type { Registration, RunOptions } from "./runner"
import type { ApplyResult, PathResolutionOpts, Project } from "./types"

export interface CodeRunnerOptions extends Omit<RunOptions, "cwd" | "pathResolution"> {
  registrations: Registration[]
}

export interface ScaffoldServiceOptions {
  pathResolution: PathResolutionOpts
  emit: ScaffoldEmit
  codeRunner: CodeRunnerOptions
  git?: { init?: boolean }
}

export const DEFAULT_REGISTRATIONS: Registration[] = [
  { id: "test", matches: { kind: "test" }, command: "bun test <path>" },
  { id: "script", matches: { kind: "script" }, command: "bun run <path>" },
  { id: "demo", matches: { kind: "demo" }, command: "bun run <path>" },
  {
    id: "story",
    matches: { kind: "story", ext: "tsx" },
    command: "bun run @paladin/utils <path> <opts>",
  },
]

export const DEFAULT_OPTIONS: ScaffoldServiceOptions = {
  pathResolution: {},
  emit: defaultEmit,
  codeRunner: { registrations: DEFAULT_REGISTRATIONS },
}

export class ScaffoldService {
  readonly sessions: Project[] = []

  private opts: ScaffoldServiceOptions
  private codeRunner: CodeRunner
  private git = new GitService()

  constructor(opts: Partial<ScaffoldServiceOptions> = {}) {
    this.opts = { ...DEFAULT_OPTIONS, ...opts }
    this.codeRunner = new CodeRunner(this.opts.codeRunner.registrations)
  }

  setOptions(opts: Partial<ScaffoldServiceOptions>) {
    this.opts = { ...this.opts, ...opts }
    if (opts.codeRunner) this.codeRunner = new CodeRunner(opts.codeRunner.registrations)
  }

  /**
   * Every stage adds ops to the unit and nothing touches disk until the end, so
   * each stage sees the world as it is plus everything the ones before it intend.
   */
  async process(input: string): Promise<ApplyResult | null> {
    const { pathResolution, codeRunner } = this.opts

    const project = await plan(input, pathResolution)
    if (!project) return null

    const versions = new VersionCache(pathResolution.npmCachePath)

    for (const unit of project.units) {
      for (const processor of postProcessors) unit.ops.push(...(await processor(unit)))
      unit.ops.push(...(await hydrateBoilerplate(project, unit)))
      unit.ops.push(...(await resolveDependencies(project, unit, pathResolution, versions)))
      unit.ops.push(
        ...this.codeRunner.run(unit.ops, {
          cwd: unit.dir,
          skip: codeRunner.skip,
          custom: codeRunner.custom,
          pathResolution,
        }),
      )
    }

    const result = await applyOperations(project.units.flatMap((unit) => unit.ops))
    this.opts.emit(result)

    this.sessions.push(project)
    if (this.opts.git?.init) await this.git.init(project.dir)

    return result
  }

  async dispatch(method: string, kwargs?: unknown) {
    return await dispatch(this, method, kwargs)
  }
}
