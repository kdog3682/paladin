import { useLayoutEffect, useState } from "react"
import { boxIn, type Box } from "../model/geometry"
import { useEditor } from "../store/useEditor"

/* dom boxes of nodes in artboard coordinates, re-measured whenever the rendered doc or zoom changes */
export function useBoxes(ids: string[], rootId: string): (Box | null)[] {
  const doc = useEditor(s => s.draft ?? s.doc)
  const zoom = useEditor(s => s.viewport.zoom)
  const key = ids.join("|")
  const [boxes, setBoxes] = useState<(Box | null)[]>([])
  useLayoutEffect(() => {
    setBoxes(ids.map(id => boxIn(id, rootId, zoom)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, rootId, zoom, doc])
  return boxes
}
