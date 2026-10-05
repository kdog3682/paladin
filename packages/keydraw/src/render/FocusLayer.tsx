import { useShallow } from "zustand/react/shallow"
import type { Box } from "../model/geometry"
import { useEditor } from "../store/useEditor"
import { useBoxes } from "./useBox"

const MODE_COLOR: Record<string, string> = {
  normal: "#3b82f6",
  input: "#f59e0b",
  text: "#10b981",
  move: "#a855f7",
  attrs: "#14b8a6",
  command: "#3b82f6",
  search: "#3b82f6",
}

function Ring({ box, zoom, color, width, dashed }: { box: Box, zoom: number, color: string, width: number, dashed?: boolean }) {
  const w = width / zoom
  return (
    <div
      className="pointer-events-none absolute"
      style={{
        left: box.x - w,
        top: box.y - w,
        width: box.w + w * 2,
        height: box.h + w * 2,
        border: `${w}px ${dashed ? "dashed" : "solid"} ${color}`,
        borderRadius: 2 / zoom,
      }}
    />
  )
}

export function FocusLayer({ rootId }: { rootId: string }) {
  const focus = useEditor(s => s.focus)
  const selected = useEditor(useShallow(s => s.selected))
  const zoom = useEditor(s => s.viewport.zoom)
  const mode = useEditor(s => s.mode)
  const [focusBox, ...selBoxes] = useBoxes([focus, ...selected], rootId)
  const color = MODE_COLOR[mode] ?? MODE_COLOR.normal

  return (
    <div className="pointer-events-none absolute inset-0">
      {selBoxes.map((b, i) => b && <Ring key={selected[i]} box={b} zoom={zoom} color={color} width={1.5} dashed />)}
      {focusBox && <Ring box={focusBox} zoom={zoom} color={color} width={2} />}
    </div>
  )
}
