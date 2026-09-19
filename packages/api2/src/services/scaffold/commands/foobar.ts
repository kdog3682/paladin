import type { ScaffoldService } from "../scaffold"

/** Placeholder command that keeps `dispatch` exercised. */
export function foobar(_ctx: ScaffoldService, opts?: { hello: boolean }) {
  return { hello: Boolean(opts?.hello) }
}
