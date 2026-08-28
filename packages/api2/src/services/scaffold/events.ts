import type { RunResult } from "./runner"
import type { Project } from "./types"

export interface ScaffoldEvents {
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
