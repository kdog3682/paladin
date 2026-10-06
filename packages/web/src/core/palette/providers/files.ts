import { toScopedPath } from "@paladin/utils"
import type { PaladinDeps } from "../deps"
import type { PaladinItem, PaladinProvider } from "../types"
import { basename } from "./format"

export const FILES_PROVIDER = "files"

export function filesProvider(deps: PaladinDeps): PaladinProvider {
  return {
    id: FILES_PROVIDER,
    group: "Files",
    limit: 8,
    debounce: 100,
    async search(query, _ctx, signal) {
      if (!query.trim()) return []
      const hits = await deps.search.files(query, signal)
      return hits.map(
        (hit): PaladinItem => ({
          id: `file:${hit.path}`,
          title: basename(hit.path),
          subtitle: toScopedPath(hit.path),
          score: hit.score,
          onSelect: () => {
            deps.panel.openView("file", { path: hit.path })
            return { focus: "panel" }
          },
        }),
      )
    },
  }
}
