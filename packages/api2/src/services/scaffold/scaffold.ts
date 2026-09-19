// @paladin/api2/src/services/scaffold/scaffold.ts
import { readdir, rm } from "node:fs/promises"
import { join } from "node:path"
import { GitService } from "../git"
import { applyOperations } from "./apply"
import { dispatch } from "./commands"
import { resolveDependencies } from "./deps/resolveDependencies"
import { VersionCache } from "./deps/versions"
import { defaultEmit } from "./emit"
import { hydrateBoilerplate } from "./hydrateBoilerplate"
import { isFixtureOp } from "./ops"
import { plan } from "./plan/plan"
import { postProcessors } from "./postProcessors"
import { CodeRunner } from "./runner"
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
  /** Empties `dir` (the directory itself stays) every `clearAfter` completed runs. Off unless set. */
  scratch?: { dir: string; clearAfter: number }
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
  private runs = 0

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
  async process(input: string | string[]): Promise<ApplyResult | null> {
    const { pathResolution, codeRunner, postProcessorOptions } = this.opts

    const project = await plan(input, pathResolution)
    if (!project) {
      await this.countRun()
      return null
    }

    for (const unit of project.units) {
      // fixtures skip every stage below and go straight to apply
      const fixtures = unit.ops.filter(isFixtureOp)
      if (fixtures.length) {
        unit.ops = unit.ops.filter((op) => !isFixtureOp(op))
        if (!unit.ops.length) {
          unit.ops = fixtures
          continue
        }
      }

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
      unit.ops.push(...fixtures)
    }

    const result = await applyOperations(project)
    if (this.opts.git?.init) await this.git.init(project.dir)
    this.opts.emit(result)
    await this.countRun()
    return result
  }

  /** Every `process` call counts, even one that plans nothing; when the count hits `clearAfter` the scratch dir is emptied and the count restarts. */
  private async countRun() {
    const scratch = this.opts.scratch
    if (!scratch || ++this.runs < scratch.clearAfter) return
    this.runs = 0
    try {
      for (const name of await readdir(scratch.dir)) {
        await rm(join(scratch.dir, name), { recursive: true, force: true })
      }
    } catch (error) {
      console.error(`could not clear ${scratch.dir}`, error)
    }
  }

  async dispatch(method: string, kwargs?: unknown) {
    return await dispatch(this, method, kwargs)
  }
}