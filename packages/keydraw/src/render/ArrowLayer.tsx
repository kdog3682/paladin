import { useMemo } from "react"
import { arrowsOf, isBound, type Endpoint } from "../model/binding"
import type { Box } from "../model/geometry"
import { useEditor } from "../store/useEditor"
import { useBoxes } from "./useBox"

/* where a line from `a`'s center toward `toward` leaves the box */
function edge(b: Box, toward: { x: number, y: number }): { x: number, y: number } {
  const cx = b.x + b.w / 2
  const cy = b.y + b.h / 2
  const dx = toward.x - cx
  const dy = toward.y - cy
  if (!dx && !dy) return { x: cx, y: cy }
  const t = Math.min(dx ? b.w / 2 / Math.abs(dx) : Infinity, dy ? b.h / 2 / Math.abs(dy) : Infinity)
  return { x: cx + dx * Math.min(t, 1), y: cy + dy * Math.min(t, 1) }
}

const center = (b: Box) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 })

/* lines and arrows of the current artboard; bound ends are re-measured, so they follow moves */
export function ArrowLayer({ rootId, boardId }: { rootId: string, boardId: string }) {
  const doc = useEditor(s => s.draft ?? s.doc)
  const zoom = useEditor(s => s.viewport.zoom)
  const arrows = useMemo(() => arrowsOf(doc, boardId), [doc, boardId])
  const ends = useMemo(() => arrows.flatMap(a => [a.from, a.to]).filter(isBound).map(e => e.node), [arrows])
  const boxes = useBoxes(ends, rootId)
  if (!arrows.length) return null
  const boxOf = new Map(ends.map((id, i) => [id, boxes[i]]))
  const point = (e: Endpoint, other: Endpoint): { x: number, y: number } | null => {
    if (!isBound(e)) return e
    const b = boxOf.get(e.node)
    if (!b) return null
    const o = isBound(other) ? boxOf.get(other.node) : null
    return edge(b, o ? center(o) : (other as { x: number, y: number }))
  }
  const w = 1.5 / zoom
  return (
    <svg className="pointer-events-none absolute inset-0 overflow-visible" width="100%" height="100%">
      <defs>
        <marker id="kd-head" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" fill="currentColor" />
        </marker>
      </defs>
      {arrows.map(a => {
        const p = point(a.from, a.to)
        const q = point(a.to, a.from)
        if (!p || !q) return null
        return (
          <line
            key={a.id}
            x1={p.x}
            y1={p.y}
            x2={q.x}
            y2={q.y}
            stroke="currentColor"
            strokeWidth={w}
            markerEnd={a.head ? "url(#kd-head)" : undefined}
            className="text-foreground"
          />
        )
      })}
    </svg>
  )
}
