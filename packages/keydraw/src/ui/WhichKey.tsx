import { useEffect, useState } from "react"
import { commandById } from "../commands/registry"
import { currentTrie } from "../commands/dispatch"
import { prettySeq } from "../keys/notation"
import { continuations, lookup } from "../keys/trie"
import { useEditor } from "../store/useEditor"

/* after a prefix (g, z, v, …) and a short delay: the keys that can follow, including user mappings and aliases (§15) */
export function WhichKey() {
  const keys = useEditor(s => s.pendingKeys)
  const delay = useEditor(s => s.defaults.editor.whichKeyDelay)
  // user mappings change the trie
  useEditor(s => s.keymapOverride)
  const [ready, setReady] = useState(false)
  const key = keys.join("\u0000")
  useEffect(() => {
    setReady(false)
    if (!keys.length) return
    const t = setTimeout(() => setReady(true), delay)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, delay])
  if (!ready || !keys.length) return null
  const node = lookup(currentTrie(), keys)
  if (!node) return null
  const items = continuations(node)
  if (!items.length) return null
  return (
    <div className="pointer-events-none absolute bottom-10 right-3 z-40 max-h-72 min-w-56 overflow-hidden rounded-md border bg-popover px-3 py-2 font-mono text-xs text-popover-foreground shadow-md">
      <div className="mb-1 text-muted-foreground">{prettySeq(keys)} …</div>
      {items.map(({ keys: rest, leaf }) => (
        <div key={rest.join("")} className="flex justify-between gap-6">
          <span className="text-foreground">{prettySeq(rest)}</span>
          <span className="truncate text-muted-foreground">{leaf.kind === "cmd" ? (commandById.get(leaf.id)?.title ?? leaf.id) : `→ ${prettySeq(leaf.keys)}`}</span>
        </div>
      ))}
    </div>
  )
}
