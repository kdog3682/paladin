import { Badge, cn } from "@paladin/shadcn"
import { prettySeq } from "../keys/notation"
import { nodeLabel, pathTo } from "../model/tree"
import { moveStepCount } from "../move-mode/session"
import { useEditor } from "../store/useEditor"

const MODE_CLASS: Record<string, string> = {
  normal: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  input: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  text: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  move: "bg-purple-500/15 text-purple-600 dark:text-purple-400",
  attrs: "bg-teal-500/15 text-teal-600 dark:text-teal-400",
  command: "bg-blue-500/15 text-blue-600",
  search: "bg-blue-500/15 text-blue-600",
}

function Breadcrumb() {
  const doc = useEditor(s => s.draft ?? s.doc)
  const focus = useEditor(s => s.focus)
  const kind = doc.nodes[focus]?.kind
  return (
    <div className="min-w-0 truncate text-muted-foreground">
      {pathTo(doc, focus)
        .map(id => nodeLabel(doc, id))
        .join(" › ")}
      {kind && <span className="ml-2 opacity-60">{kind}</span>}
    </div>
  )
}

export function StatusLine() {
  const mode = useEditor(s => s.mode)
  // moveStepCount() reads module state; each step changes the draft, which re-renders this
  useEditor(s => s.draft)
  const keys = useEditor(s => s.pendingKeys)
  const count = useEditor(s => s.pendingCount)
  const hint = useEditor(s => s.hint)
  const search = useEditor(s => s.search)
  const message = useEditor(s => s.message)
  const selCount = useEditor(s => s.selected.length)
  const title = useEditor(s => s.doc.title)
  const zoom = useEditor(s => s.viewport.zoom)
  const undo = useEditor(s => s.past.length)
  const redo = useEditor(s => s.future.length)
  const visible = useEditor(s => s.defaults.layout.statusLine)
  if (!visible) return null

  const pending = `${count ?? ""}${prettySeq(keys)}`

  return (
    <div className="flex h-8 shrink-0 items-center gap-3 border-t bg-background px-3 font-mono text-xs">
      <Badge variant="secondary" className={cn("rounded-sm px-1.5 py-0 text-[10px] uppercase leading-4", MODE_CLASS[mode])}>
        {hint ? "hint" : mode}
      </Badge>
      {mode === "move" && <span className="text-purple-600 dark:text-purple-400">{moveStepCount()} steps</span>}
      {hint && <span>f{hint.typed}</span>}
      {search.active && (
        <span className="text-blue-600 dark:text-blue-400">
          /{search.query} {search.index + 1}/{search.matches.length}
        </span>
      )}
      <Breadcrumb />
      <div className="flex-1" />
      {message && <span className="text-destructive">{message}</span>}
      {pending && <span className="text-foreground">{pending}</span>}
      {selCount > 0 && <span>{selCount} selected</span>}
      <span className="text-muted-foreground">
        ↶{undo} ↷{redo}
      </span>
      <span className="text-muted-foreground">{Math.round(zoom * 100)}%</span>
      <span className="truncate text-muted-foreground">{title}</span>
    </div>
  )
}
