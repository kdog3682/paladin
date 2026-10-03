import type { BashResult } from "@paladin/utils"
import type { BASH_ORDER } from "./ops"

export type WriteMode = "write" | "append" | "merge"

export interface OpMeta {
  /** Who emitted this op — "parseFileContent", "deleteShadowedFiles", "codeRunner", ... */
  source: string
  /** Set by apply: whether the op actually happened. */
  applied?: boolean
  /** Why it didn't, or why it was a skip in the first place. */
  reason?: string
}

export type FsOp =
  /** `merge` deep-merges JSON on both sides, and falls back to codeMerge for source. */
  | (OpMeta & {
      kind: "write"
      path: string
      content: string
      mode: WriteMode
      /** Set by apply: whether the file didn't exist before. */
      created?: boolean
    })
  /** `strict` here means a non-zero exit stops every command queued behind it. */
  | (OpMeta & {
      kind: "bash"
      /** One of `BASH_ORDER` (ops.ts), which also sets the run order. */
      purpose: (typeof BASH_ORDER)[number]
    } & Pick<BashResult, "args" | "cwd" | "strict">
      /** The output fields are set by apply once the command has run. */
      & Partial<BashResult>)
  /** Directories go through rmDir, which refuses anything holding a git repo. */
  | (OpMeta & { kind: "delete"; path: string })
  /** Untouched, but still visible — the runner reruns tests for unchanged files. */
  | (OpMeta & { kind: "skip"; path: string; content?: string })
  | (OpMeta & { kind: "deprecated"; path: string })

export type OpKind = FsOp["kind"]
export type WriteOp = Extract<FsOp, { kind: "write" }>
export type BashOp = Extract<FsOp, { kind: "bash" }>
export type DeleteOp = Extract<FsOp, { kind: "delete" }>
export type SkipOp = Extract<FsOp, { kind: "skip" }>
export type DeprecatedOp = Extract<FsOp, { kind: "deprecated" }>

/** Every op except bash addresses a single path. */
export type PathOp = Exclude<FsOp, BashOp>

export interface Unit {
  name: string
  dir: string
  isNew: boolean
  ops: FsOp[]
}

export interface Project {
  name: string
  dir: string
  isNew: boolean
  units: Unit[]
}

export interface PathResolutionOpts {
  base?: string
  relativeTo?: string
  npmCachePath?: string
}

export interface UnitResult {
  name: string
  /** Absolute — the only absolute path in the result. */
  dir: string
  isNew: boolean
  /** Paths (and bash cwds) are relative to `dir`; join to get back to disk. */
  ops: FsOp[]
}

export interface ApplyResult {
  name: string
  dir: string
  isNew: boolean
  units: UnitResult[]
}


