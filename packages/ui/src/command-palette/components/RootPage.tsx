import { usePalette, usePaletteState } from "../context"
import { EntryList } from "./EntryRow"

const DEFAULT_PLACEHOLDER = "Search commands, files, symbols…"

export function RootPage() {
  const palette = usePalette()
  const query = usePaletteState((s) => {
    const page = s.pages[s.pages.length - 1]
    return page.type === "root" ? page.query : ""
  })
  const placeholder = usePaletteState((s) => s.openOptions.placeholder)

  return (
    <EntryList
      query={query}
      placeholder={placeholder ?? DEFAULT_PLACEHOLDER}
      onQuery={palette.actions.setQuery}
    />
  )
}
