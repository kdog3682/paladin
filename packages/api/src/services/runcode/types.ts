// src/services/runcode/types.ts

import type { BashResult } from "../../utils/bash"

export interface HandlerDef {
  name: string
  suffix: string
  run: (file: string) => Promise<BashResult | Record<string, unknown>>
  /** if true, a source file change will also trigger its paired handler file */
  pairs: boolean
  /** whether this handler auto-runs by default when files update */
  autoRun: boolean
}

export interface RunFile {
  handler: string
  file: string
}

export interface RunResult {
  name: string
  file: string
  success: boolean
  data: BashResult | Record<string, unknown>
}
