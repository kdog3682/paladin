import { useEditor } from "../store/useEditor"
import { ArrowLayer } from "./ArrowLayer"
import { FocusLayer } from "./FocusLayer"
import { HintLayer } from "./HintLayer"
import { NodeView } from "./NodeView"
import { SearchLayer } from "./SearchLayer"

export function ArtboardView({ boardId }: { boardId: string }) {
  const board = useEditor(s => (s.draft ?? s.doc).boards[boardId])
  const zoom = useEditor(s => s.viewport.zoom)
  if (!board) return null

  return (
    <div className="relative" style={{ width: board.width, height: board.height }} data-board={boardId}>
      <div
        className="absolute left-0 whitespace-nowrap text-xs text-muted-foreground"
        style={{ bottom: "100%", transform: `scale(${1 / zoom})`, transformOrigin: "0 100%", paddingBottom: 4 }}
      >
        {board.name} · {board.width}×{board.height}
      </div>
      <div className="absolute inset-0 shadow-lg">
        <NodeView id={board.root} />
      </div>
      <ArrowLayer rootId={board.root} boardId={boardId} />
      <SearchLayer rootId={board.root} />
      <FocusLayer rootId={board.root} />
      <HintLayer rootId={board.root} />
    </div>
  )
}
