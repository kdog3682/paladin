import { useMemo } from "react"
import { rootOf } from "../model/tree"
import { useEditor } from "../store/useEditor"
import { useBoxes } from "./useBox"

/* highlights every match on this artboard, live while typing and while search-active */
export function SearchLayer({ rootId }: { rootId: string }) {
  const doc = useEditor(s => s.doc)
  const search = useEditor(s => s.search)
  const showing = useEditor(s => s.mode === "search" || s.search.active)
  const zoom = useEditor(s => s.viewport.zoom)
  const current = search.active ? search.matches[search.index] : undefined
  const ids = useMemo(
    () => (showing ? search.matches.filter(id => doc.nodes[id] && rootOf(doc, id) === rootId) : []),
    [showing, search.matches, doc, rootId],
  )
  const boxes = useBoxes(ids, rootId)
  if (!showing) return null

  return (
    <div className="pointer-events-none absolute inset-0">
      {ids.map((id, i) => {
        const b = boxes[i]
        if (!b) return null
        const isCurrent = id === current
        return (
          <div
            key={id}
            className="absolute"
            style={{
              left: b.x,
              top: b.y,
              width: b.w,
              height: b.h,
              background: isCurrent ? "rgba(249,115,22,0.30)" : "rgba(250,204,21,0.25)",
              outline: `${(isCurrent ? 2 : 1) / zoom}px solid ${isCurrent ? "#f97316" : "#eab308"}`,
            }}
          />
        )
      })}
    </div>
  )
}
