import { currentRoot } from "../model/tree"
import { idleSearch, type SearchState } from "../store/slices/search"
import { S, useEditor } from "../store/useEditor"
import { findMatches, nextAfter, searchOrder } from "./match"

const HISTORY_CAP = 100

export const SEARCH_COMMANDS = [
  { id: "mode.search", title: "Search", group: "normal", description: "Find a node by name, kind, component or text" },
  { id: "search.next", title: "Next match", group: "search", description: "wraps around" },
  { id: "search.prev", title: "Previous match", group: "search", description: "wraps around" },
  { id: "search.clear", title: "End search", group: "search" },
  { id: "search.commit", title: "Jump to first match", group: "search" },
  { id: "search.cancel", title: "Cancel search", group: "search" },
  { id: "search.backspace", title: "Delete character", group: "search" },
  { id: "search.deleteWord", title: "Delete word", group: "search" },
  { id: "search.historyPrev", title: "Older search", group: "search" },
  { id: "search.historyNext", title: "Newer search", group: "search" },
]

function patch(p: Partial<SearchState>) {
  useEditor.setState(s => ({ search: { ...s.search, ...p } }))
}

function order(): string[] {
  const s = S()
  return searchOrder(s.doc, s.settings.search, currentRoot(s.doc))
}

function setLine(line: string) {
  patch({ line, matches: findMatches(S().doc, order(), line), histPos: null })
}

function startSearch() {
  useEditor.setState({ mode: "search", search: idleSearch })
}

export function clearSearch() {
  if (S().search !== idleSearch) useEditor.setState({ search: idleSearch })
}

function commitSearch() {
  const s = S()
  const q = s.search.line
  const matches = s.search.matches
  useEditor.setState({ mode: "normal" })
  if (!q) return clearSearch()
  const history = [...s.searchHistory.filter(h => h !== q), q].slice(-HISTORY_CAP)
  useEditor.setState({ searchHistory: history })
  const target = matches.length ? nextAfter(order(), matches, s.focus) : undefined
  if (!target) {
    clearSearch()
    return s.say(`no match: ${q}`)
  }
  useEditor.setState({ search: { ...idleSearch, line: q, query: q, active: true, matches, index: matches.indexOf(target) } })
  S().setFocus(target)
}

function cancelSearch() {
  useEditor.setState({ mode: "normal", search: idleSearch })
}

function step(dir: 1 | -1, count: number) {
  const { matches, index } = S().search
  if (!matches.length) return
  const n = matches.length
  const i = (((index + dir * count) % n) + n) % n
  patch({ index: i })
  S().setFocus(matches[i])
}

/* ↑ walks to older entries, ↓ to newer ones and finally back to the typed line */
function walkHistory(dir: -1 | 1) {
  const s = S()
  const h = s.searchHistory
  let { histPos: pos, histDraft: draft } = s.search
  if (!h.length) return
  if (pos === null) {
    if (dir > 0) return
    draft = s.search.line
    pos = h.length
  }
  pos += dir
  if (pos < 0) pos = 0
  const restored = pos >= h.length
  const line = restored ? draft : h[pos]
  patch({ line, matches: findMatches(s.doc, order(), line), histPos: restored ? null : pos, histDraft: draft })
}

/* typed characters in the search line */
export function typeSearch(ch: string) {
  setLine(S().search.line + ch)
}

const deleteWord = (s: string) => s.replace(/\S*\s*$/, "")

export const searchHandlers: Record<string, (count: number) => void> = {
  "mode.search": () => startSearch(),
  "search.next": c => step(1, c),
  "search.prev": c => step(-1, c),
  "search.clear": () => clearSearch(),
  "search.commit": () => commitSearch(),
  "search.cancel": () => cancelSearch(),
  "search.backspace": () => setLine(S().search.line.slice(0, -1)),
  "search.deleteWord": () => setLine(deleteWord(S().search.line)),
  "search.historyPrev": () => walkHistory(-1),
  "search.historyNext": () => walkHistory(1),
}
