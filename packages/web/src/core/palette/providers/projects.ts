import { fuzzyFilter } from "@paladin/ui"
import { toScopedPath } from "@paladin/utils"
import type { PaladinDeps, ProjectSummary } from "../deps"
import type { PaladinItem, PaladinProvider } from "../types"

export const PROJECTS_PROVIDER = "projects"

/* inactive projects stay searchable but rank below active ones */
const INACTIVE_PENALTY = 0.5

export function projectsProvider(deps: PaladinDeps): PaladinProvider {
  return {
    id: PROJECTS_PROVIDER,
    group: "Projects",
    limit: 5,
    debounce: 60,
    async search(query, ctx, signal) {
      const projects = await deps.workspace.listProjects(signal)
      const recent = [...projects].sort((a, b) => b.touchedAt - a.touchedAt)
      return fuzzyFilter(query, recent, (p: ProjectSummary) => [p.name, p.root]).map(
        ({ item: p, score }): PaladinItem => ({
          id: `project:${p.id}`,
          title: p.name,
          subtitle: p.id === ctx.projectId ? "current" : p.status === "active" ? toScopedPath(p.root) : p.status,
          score: p.status === "active" ? score : score * INACTIVE_PENALTY,
          onSelect: async () => {
            await deps.workspace.openProject(p.id)
            return { focus: "editor" }
          },
        }),
      )
    },
  }
}
