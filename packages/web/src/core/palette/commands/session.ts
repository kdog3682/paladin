import { fuzzyFilter } from "@paladin/ui"
import type { PaladinDeps, ProjectStatus, ProjectSummary } from "../deps"
import { commandEntry, defineAction, defineList, itemEntry } from "../define"
import { sessionItems } from "../providers/sessions"
import type { PaladinCommand, PaladinEntry } from "../types"

const STATUSES: ProjectStatus[] = ["active", "suspended", "archived"]

/* second level of "set project status": the statuses for one project */
function statusList(deps: PaladinDeps, project: ProjectSummary): PaladinCommand {
  return defineList({
    id: `project.setStatus:${project.id}`,
    title: project.name,
    keywords: [project.name, project.root],
    placeholder: `Status for ${project.name}…`,
    items: async (query) =>
      fuzzyFilter(query, STATUSES, (s) => s).map(({ item: status }) =>
        itemEntry({
          id: status,
          title: status,
          subtitle: status === project.status ? "current" : undefined,
          onSelect: async () => {
            await deps.workspace.setProjectStatus(project.id, status)
            return { focus: "restore" }
          },
        }),
      ),
  })
}

export function sessionCommands(deps: PaladinDeps): PaladinCommand[] {
  return [
    defineAction({
      id: "session.new",
      title: "New session",
      keywords: ["new session", "create session"],
      group: "Session",
      run: async (ctx) => {
        await deps.workspace.newSession(ctx.projectId)
        return { focus: "editor" }
      },
    }),

    defineList({
      id: "session.switch",
      title: "Switch session",
      keywords: ["session", "switch session", "sessions"],
      group: "Session",
      placeholder: "Search sessions…",
      items: async (query, ctx, signal) =>
        (await sessionItems(deps, query, ctx, signal)).map(itemEntry),
    }),

    defineList({
      id: "project.setStatus",
      title: "Set project status",
      keywords: ["status", "set status", "project status", "archive", "suspend"],
      group: "Project",
      placeholder: "Pick a project…",
      items: async (query, _ctx, signal): Promise<PaladinEntry[]> => {
        const projects = await deps.workspace.listProjects(signal)
        const recent = [...projects].sort((a, b) => b.touchedAt - a.touchedAt)
        return fuzzyFilter(query, recent, (p) => p.name).map(({ item }) =>
          commandEntry(statusList(deps, item)),
        )
      },
    }),
  ]
}
