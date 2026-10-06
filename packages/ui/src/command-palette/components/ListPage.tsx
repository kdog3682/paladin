import { usePalette, useTopPage } from "../context"
import { EntryList } from "./EntryRow"

export function ListPage() {
  const palette = usePalette()
  const page = useTopPage()
  if (page.type !== "list") return null

  const placeholder = page.command.placeholder ?? `Search ${page.command.title.toLowerCase()}…`

  return <EntryList query={page.query} placeholder={placeholder} onQuery={palette.actions.setQuery} />
}
