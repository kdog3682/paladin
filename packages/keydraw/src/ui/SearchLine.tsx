import { useEditor } from "../store/useEditor"

/* the search line while typing (§10); the status line shows the position once search is active */
export function SearchLine() {
  const typing = useEditor(s => s.mode === "search")
  const line = useEditor(s => s.search.line)
  const count = useEditor(s => s.search.matches.length)
  if (!typing) return null

  return (
    <div className="flex h-8 shrink-0 items-center gap-2 border-t bg-background px-3 font-mono text-sm">
      <span className="text-muted-foreground">/</span>
      <span>{line}</span>
      <span className="kd-caret" />
      <div className="flex-1" />
      <span className="text-xs text-muted-foreground">{line ? `${count} match${count === 1 ? "" : "es"}` : ""}</span>
    </div>
  )
}
