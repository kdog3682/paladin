import type { Slice } from "../useEditor"

export type SearchState = {
  /* text in the search line (live while typing) */
  line: string
  /* committed query while search-active; empty otherwise */
  query: string
  /* search-active: from Enter until Esc or any command other than n / # */
  active: boolean
  matches: string[]
  /* position in `matches` of the current match */
  index: number
  /* history walk: position in searchHistory, or null while on the typed line */
  histPos: number | null
  histDraft: string
}

export const idleSearch: SearchState = { line: "", query: "", active: false, matches: [], index: 0, histPos: null, histDraft: "" }

export type SearchSlice = {
  search: SearchState
  /* oldest first; persisted */
  searchHistory: string[]
}

export const createSearchSlice: Slice<SearchSlice> = () => ({
  search: idleSearch,
  searchHistory: [],
})
