import { useMemo } from "react"
import { assignHints, hintTargets } from "../keys/hints"
import { useEditor } from "../store/useEditor"
import { useBoxes } from "./useBox"

export function HintLayer({ rootId }: { rootId: string }) {
  const hint = useEditor(s => s.hint)
  const doc = useEditor(s => s.doc)
  const zoom = useEditor(s => s.viewport.zoom)
  const hints = useMemo(() => (hint ? assignHints(hintTargets(doc)) : []), [hint !== null, doc])
  const boxes = useBoxes(
    hints.map(h => h.id),
    rootId,
  )
  if (!hint) return null

  return (
    <div className="pointer-events-none absolute inset-0">
      {hints.map((h, i) => {
        const b = boxes[i]
        if (!b || !h.label.startsWith(hint.typed)) return null
        return (
          <div
            key={h.id}
            className="absolute rounded bg-yellow-300 px-1 font-mono text-xs font-bold text-black shadow"
            style={{ left: b.x, top: b.y, transform: `scale(${1 / zoom})`, transformOrigin: "0 0" }}
          >
            <span className="opacity-40">{hint.typed}</span>
            {h.label.slice(hint.typed.length)}
          </div>
        )
      })}
    </div>
  )
}
