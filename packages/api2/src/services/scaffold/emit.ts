import { print } from "./print"
import type { ApplyResult } from "./types"

/** Told about every finished `process` call. */
export type ScaffoldEmit = (result: ApplyResult) => void

/** Copies whatever is worth reading from the result (errors, artifacts, command output) to the clipboard. */
export const defaultEmit: ScaffoldEmit = print
