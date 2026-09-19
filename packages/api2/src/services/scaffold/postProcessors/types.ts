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

  /** `src/foobar.ts` beside the barrel, or `src/foobar/index.ts` one folder down. */
  fileRelativeToBarrelIndex?: boolean

  /**
   * Every source file under these paths is an entry, however deep and whatever it
   * is named. For flat category layouts (`fs/`, `path/`) where the file name is the export.
   */
  alwaysBarrel?: string[]

  /**
   * Scope gate: packages the rules above apply to, as a run of whole path segments
   * or a glob. Empty means every unit.
   */
  matches?: string[]
}

export interface PostProcessorOptions {
  updateBarrel?: UpdateBarrelOptions
}

/** Reads a unit's ops and adds more. Never touches disk. */
export type PostProcessor = (unit: Unit, opts: PostProcessorOptions) => FsOp[] | Promise<FsOp[]>
