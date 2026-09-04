// @paladin/api2/src/services/scaffold/scaffold.ts
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
import { print } from "./print"
import type { ScaffoldEmit } from "./emit"
import type { PostProcessorOptions } from "./postProcessors/types"
import type { Registration, RunOptions } from "./runner"
import type { ApplyResult, PathResolutionOpts } from "./types"

export interface CodeRunnerOptions extends Omit<RunOptions, "cwd" | "pathResolution"> {
  /** Falls back to the runner's DEFAULT_REGISTRATIONS. */
  registrations?: Registration[]
}

export interface ScaffoldServiceOptions {
  pathResolution: PathResolutionOpts
  emit: ScaffoldEmit
  codeRunner: CodeRunnerOptions
  postProcessorOptions: PostProcessorOptions
  git?: { init?: boolean }
}

export const DEFAULT_OPTIONS: ScaffoldServiceOptions = {
  pathResolution: {
    base: '~/projects',
    relativeTo: null,
  },
  emit: defaultEmit,
  codeRunner: {},
  postProcessorOptions: {
    updateBarrel: {
      fileMatchesFolder: true,
      alwaysBarrel: ['packages/utils'],
      treatIndexAsEntry: true,
      treatNamedIndexAsEntry: true,
      matches: ["packages/utils", "packages/ui"],
    },
  },
}

export class ScaffoldService {
  private readonly opts: ScaffoldServiceOptions
  private readonly codeRunner: CodeRunner
  private readonly versions: VersionCache
  private git = new GitService()

  constructor(opts: Partial<ScaffoldServiceOptions> = {}) {
    this.opts = {
      ...DEFAULT_OPTIONS,
      ...opts,
      // merged a level down so passing one processor's options doesn't drop the rest
      postProcessorOptions: {
        ...DEFAULT_OPTIONS.postProcessorOptions,
        ...opts.postProcessorOptions,
      },
    }
    this.codeRunner = new CodeRunner(this.opts.codeRunner.registrations)
    this.versions = new VersionCache(this.opts.pathResolution.npmCachePath)
  }

  /**
   * Every stage adds ops to the unit and nothing touches disk until the end, so
   * each stage sees the world as it is plus everything the ones before it intend.
   */
  async process(input: string): Promise<ApplyResult | null> {
    const { pathResolution, codeRunner, postProcessorOptions } = this.opts

    const project = await plan(input, pathResolution)
    if (!project) return null

    for (const unit of project.units) {
      for (const processor of postProcessors) {
        unit.ops.push(...(await processor(unit, postProcessorOptions)))
      }
      unit.ops.push(...(await hydrateBoilerplate(project, unit)))
      unit.ops.push(...(await resolveDependencies(project, unit, pathResolution, this.versions)))
      unit.ops.push(
        ...this.codeRunner.run(unit.ops, {
          cwd: unit.dir,
          scopedRunOptions: codeRunner.scopedRunOptions,
          disabled: codeRunner.disabled,
          pathResolution,
        }),
      )
    }

    const result = await applyOperations(project)
    if (this.opts.git?.init) await this.git.init(project.dir)
    this.opts.emit(print(result))
    return result
  }

  async dispatch(method: string, kwargs?: unknown) {
    return await dispatch(this, method, kwargs)
  }
}