import { assignHints, hintTargets } from "../keys/hints"
import { eventToKey } from "../keys/notation"
import { createParser, type ParseResult } from "../keys/parser"
import { getTrie } from "../keys/trie"
import type { Mode } from "../model/types"
import { S, useEditor, type EditorState } from "../store/useEditor"
import { clearSearch } from "../search/search"
import { commitInput, handlers, typeChar } from "./commands"

const parser = createParser()
let timer: ReturnType<typeof setTimeout> | undefined

const TYPING: Mode[] = ["input", "text", "command", "search", "modal-text"]

/* mode-scoped state: "search" from Enter until Esc or any command other than n / # */
function stateOf(s: EditorState): string | undefined {
  return s.search.active ? "search" : undefined
}

export function currentTrie() {
  const s = S()
  return getTrie(s.keymapOverride, s.mode, stateOf(s))
}

export function run(id: string, count: number | null): void {
  const s = S()
  const handler = handlers[id]
  if (!handler) return s.say(`not implemented yet: ${id}`)
  if (s.message) s.say(null)
  if (s.search.active && id !== "search.next" && id !== "search.prev") clearSearch()
  // arrows and other commands in Input mode commit pending tokens first
  if (s.mode === "input" && !id.startsWith("input.") && !id.startsWith("nudge.")) commitInput()
  handler(count ?? 1)
}

function typeKey(key: string): boolean {
  if (key === "<Space>") return typeChar(" ")
  if (key.length === 1) return typeChar(key)
  return false
}

function process(results: ParseResult[], typing: boolean): boolean {
  let handled = false
  for (const r of results) {
    if (r.type === "command") {
      run(r.id, r.count)
      handled = true
    } else if (r.type === "pending") {
      handled = true
      if (r.ambiguous) {
        timer = setTimeout(() => process(parser.flush(currentTrie()), typing), S().defaults.editor.timeoutLen)
      }
    } else if (typing) {
      for (const k of r.keys) if (typeKey(k)) handled = true
    }
  }
  const p = parser.pending()
  useEditor.setState({ pendingKeys: p.keys, pendingCount: p.count })
  return handled
}

function hintKey(key: string) {
  const s = S()
  if (!s.hint) return
  if (key === "<Esc>") return useEditor.setState({ hint: null, message: null })
  const purpose = s.hint.purpose
  if (key === "<BS>") return useEditor.setState({ hint: { typed: s.hint.typed.slice(0, -1), purpose } })
  if (key.length !== 1) return
  const typed = s.hint.typed + key
  const hints = assignHints(hintTargets(s.doc))
  const exact = hints.find(h => h.label === typed)
  if (exact) {
    useEditor.setState({ hint: null, message: null })
    if (purpose === "arrow") return void s.commit({ type: "arrow", to: exact.id }, { repeatable: false })
    return s.setFocus(exact.id)
  }
  if (!hints.some(h => h.label.startsWith(typed))) return useEditor.setState({ hint: null, message: "no such hint" })
  useEditor.setState({ hint: { typed, purpose } })
}

export function handleKeyDown(e: KeyboardEvent): void {
  if (e.isComposing) return
  const el = e.target as HTMLElement | null
  if (el?.closest?.("[data-keydraw-ignore]")) return
  const key = eventToKey(e)
  if (!key) return
  const s = S()
  if (s.hint) {
    e.preventDefault()
    return hintKey(key)
  }
  if (timer) {
    clearTimeout(timer)
    timer = undefined
  }
  const typing = TYPING.includes(s.mode)
  const results = parser.feed(currentTrie(), key, { counts: !typing })
  if (process(results, typing)) e.preventDefault()
}
