import { cn } from "@paladin/shadcn"
import { Eye, EyeOff, Lock } from "lucide-react"
import { useShallow } from "zustand/react/shallow"
import { currentRoot, nodeLabel, readingOrder } from "../model/tree"
import { useEditor } from "../store/useEditor"

/* the current artboard's tree, with lock and hide markers; the focused node and selection are highlighted */
export function LayerTree({ width = 220 }: { width?: number }) {
  const doc = useEditor(s => s.draft ?? s.doc)
  const focus = useEditor(s => s.focus)
  const selected = useEditor(useShallow(s => s.selected))
  const order = readingOrder(doc, currentRoot(doc))
  const depth = (id: string) => {
    let d = 0
    for (let p = doc.nodes[id].parent; p; p = doc.nodes[p].parent) d++
    return d
  }
  return (
    <aside className="flex h-full shrink-0 flex-col border-r bg-background text-sm" style={{ width }}>
      <header className="border-b px-3 py-2 text-xs text-muted-foreground">Layers</header>
      <div className="flex-1 overflow-y-auto py-1">
        {order.map(id => {
          const n = doc.nodes[id]
          return (
            <div
              key={id}
              ref={el => {
                if (id === focus) el?.scrollIntoView({ block: "nearest" })
              }}
              className={cn(
                "flex items-center gap-1 px-2 py-0.5",
                selected.includes(id) && "bg-accent/60",
                id === focus && "bg-accent text-accent-foreground",
                n.hidden && "text-muted-foreground",
              )}
              style={{ paddingLeft: 8 + depth(id) * 12 }}
            >
              <span className="min-w-0 flex-1 truncate">{nodeLabel(doc, id)}</span>
              {n.locked && <Lock size={12} />}
              {n.hidden && <EyeOff size={12} />}
              {!n.hidden && n.parent && <Eye size={12} className="opacity-0" />}
            </div>
          )
        })}
      </div>
    </aside>
  )
}
