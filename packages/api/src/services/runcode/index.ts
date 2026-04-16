// src/services/runcode/index.ts

import { CodeRunner } from "./CodeRunner"

export { CodeRunner } from "./CodeRunner"
export type { HandlerDef, RunFile, RunResult } from "./types"

/** Shared singleton used across the app. */
export const codeRunner = new CodeRunner()
