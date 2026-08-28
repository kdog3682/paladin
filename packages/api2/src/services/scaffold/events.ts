import type { RunResult } from "./runner"
import type { PostProcessResult, Project } from "./types"

export interface ScaffoldEvents {
  processResult: PostProcessResult
  project: Project
  runResults: RunResult[]
}

export interface ScaffoldMessage<K extends keyof ScaffoldEvents = keyof ScaffoldEvents> {
  kind: K
  payload: ScaffoldEvents[K]
}

export type ScaffoldEmit = <K extends keyof ScaffoldEvents>(
  kind: K,
  payload: ScaffoldEvents[K],
) => void
