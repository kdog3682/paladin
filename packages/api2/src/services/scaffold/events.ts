import type { ApplyResult } from "./types"

export interface ScaffoldEvents {
  result: ApplyResult
}

export interface ScaffoldMessage<K extends keyof ScaffoldEvents = keyof ScaffoldEvents> {
  kind: K
  payload: ScaffoldEvents[K]
}
