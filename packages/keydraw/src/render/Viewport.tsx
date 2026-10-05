import { useEffect, useRef } from "react"
import { useShallow } from "zustand/react/shallow"
import { fitBoard } from "../commands/commands"
import { viewportEl, viewportSize } from "../model/geometry"
import { S, useEditor } from "../store/useEditor"
import { ArtboardView } from "./ArtboardView"

/* a persisted pan/zoom from a different window size can leave the board off-screen (or under a panel) */
function boardCenterVisible() {
  const { doc, viewport: v } = S()
  const b = doc.boards[doc.currentBoard]
  const { w, h } = viewportSize()
  const cx = v.x + (b.width * v.zoom) / 2
  const cy = v.y + (b.height * v.zoom) / 2
  return cx > 0 && cx < w && cy > 0 && cy < h
}

export function Viewport() {
  const boardId = useEditor(s => s.doc.currentBoard)
  const { x, y, zoom } = useEditor(useShallow(s => ({ x: s.viewport.x, y: s.viewport.y, zoom: s.viewport.zoom })))
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    viewportEl.current = ref.current
    if (!S().viewport.fitted || !boardCenterVisible()) fitBoard()
    // panels opening/closing resize the viewport: keep the board centered instead of letting it slide under them
    const el = ref.current
    let size = el ? { w: el.clientWidth, h: el.clientHeight } : null
    const ro = el && typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(() => {
          const next = { w: el.clientWidth, h: el.clientHeight }
          if (size && (next.w !== size.w || next.h !== size.h)) {
            const v = S().viewport
            S().setViewport({ x: v.x + (next.w - size.w) / 2, y: v.y + (next.h - size.h) / 2 })
          }
          size = next
        })
      : null
    if (el) ro?.observe(el)
    return () => {
      ro?.disconnect()
      viewportEl.current = null
    }
  }, [])

  return (
    <div ref={ref} className="relative min-h-0 flex-1 overflow-hidden bg-muted">
      <div
        className="absolute left-0 top-0"
        style={{ transform: `translate(${x}px, ${y}px) scale(${zoom})`, transformOrigin: "0 0" }}
      >
        <ArtboardView boardId={boardId} />
      </div>
    </div>
  )
}
