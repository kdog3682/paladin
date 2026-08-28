import type { ScaffoldService } from "../scaffold"

export function foobar(ctx: ScaffoldService, opts?: { hello: boolean }) {
  if (opts?.hello) return { sessions: ctx.sessions.length, hello: true }
  return ctx.sessions.length
}
