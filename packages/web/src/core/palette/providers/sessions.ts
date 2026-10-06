import { fuzzyFilter } from "@paladin/ui"
import type { PaladinDeps, SessionSummary } from "../deps"
import type { PaladinCtx, PaladinItem, PaladinProvider } from "../types"
import { timeAgo } from "./format"

export const SESSIONS_PROVIDER = "sessions"

/* current project's sessions, newest first, as selectable items */
export async function sessionItems(
  deps: PaladinDeps,
  query: string,
  ctx: PaladinCtx,
  signal: AbortSignal,
): Promise<PaladinItem[]> {
  const sessions = await deps.workspace.listSessions(ctx.projectId, signal)
  const newest = [...sessions].sort((a, b) => b.updatedAt - a.updatedAt)
  return fuzzyFilter(query, newest, (s: SessionSummary) => s.name).map(({ item: s, score }): PaladinItem => ({
    id: `session:${s.id}`,
    title: s.name,
    subtitle: s.id === ctx.sessionId ? "current" : timeAgo(s.updatedAt),
    score,
    onSelect: async () => {
      await deps.workspace.switchSession(s.id)
      return { focus: "editor" }
    },
  }))
}

export function sessionsProvider(deps: PaladinDeps): PaladinProvider {
  return {
    id: SESSIONS_PROVIDER,
    group: "Sessions",
    limit: 5,
    debounce: 60,
    search: (query, ctx, signal) => sessionItems(deps, query, ctx, signal),
  }
}
