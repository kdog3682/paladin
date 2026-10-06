import { toScopedPath } from "@paladin/utils"
import type { PaladinDeps } from "../deps"
import type { PaladinItem, PaladinProvider } from "../types"

export const SYMBOLS_PROVIDER = "symbols"

export function symbolsProvider(deps: PaladinDeps): PaladinProvider {
  return {
    id: SYMBOLS_PROVIDER,
    group: "Symbols",
    limit: 8,
    debounce: 120,
    async search(query, _ctx, signal) {
      if (!query.trim()) return []
      const hits = await deps.search.symbols(query, signal)
      return hits.map(
        (hit): PaladinItem => ({
          id: `symbol:${hit.path}:${hit.line}:${hit.name}`,
          title: hit.name,
          subtitle: `${hit.kind} · ${toScopedPath(hit.path)}:${hit.line}`,
          score: hit.score,
          onSelect: () => {
            /* opens the file view scrolled to the symbol */
            deps.panel.openView("file", { path: hit.path, symbol: hit.name, line: hit.line })
            return { focus: "panel" }
          },
        }),
      )
    },
  }
}
