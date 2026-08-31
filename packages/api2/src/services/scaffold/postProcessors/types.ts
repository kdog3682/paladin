import type { FsOp, Unit } from "../types"

/**
 * Nothing is barrelled unless one of the entry rules below says so — they are the
 * complete list of things that earn a file an export from the root barrel.
 */
export interface UpdateBarrelOptions {
  /** `scaffold/scaffold.ts`, `components/Foobar/Foobar.tsx` — a file named after its folder. */
  fileMatchesFolder?: boolean

  /** `foo/index.ts` — a nested index. The root barrel itself is never re-exported. */
  treatIndexAsEntry?: boolean

  /** `foobar.index.ts` — a name carrying an `.index` suffix. */
  treatNamedIndexAsEntry?: boolean

  /**
   * Packages the rules above apply to, as a run of whole path segments or a glob
   * (`packages/utils`, `packages/*`). A unit outside this list is left alone.
   * Omit or leave empty to apply the rules to every unit.
   */
  matches?: string[]
}

export interface PostProcessorOptions {
  updateBarrel?: UpdateBarrelOptions
}

export type PostProcessor = (unit: Unit, opts: PostProcessorOptions) => FsOp[] | Promise<FsOp[]>
