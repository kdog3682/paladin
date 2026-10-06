import type { FocusApi } from "./deps"
import type { PaladinCtx, PaladinResult } from "./types"

/* applies a command's focus request once the palette has closed */
export function createOnDone(focus: FocusApi) {
  return (result: PaladinResult | void, ctx: PaladinCtx) => {
    const target = result?.focus ?? "restore"
    focus.focus(target === "restore" ? ctx.origin : target)
  }
}
