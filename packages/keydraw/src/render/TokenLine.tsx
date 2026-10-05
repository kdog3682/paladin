import { ghost } from "../input-mode/complete"
import { useEditor } from "../store/useEditor"
import { useBoxes } from "./useBox"

/* the Input-mode token line, floating beside the focused node */
export function TokenLine({ rootId }: { rootId: string }) {
  const mode = useEditor(s => s.mode)
  const line = useEditor(s => s.line)
  const focus = useEditor(s => s.focus)
  const zoom = useEditor(s => s.viewport.zoom)
  const visible = useEditor(s => s.defaults.layout.tokenLine)
  const [box] = useBoxes([focus], rootId)
  if (mode !== "input" || !visible || !box) return null

  return (
    <div
      className="pointer-events-none absolute z-50 whitespace-pre rounded-md border bg-popover px-2 py-1 font-mono text-sm text-popover-foreground shadow-md"
      style={{ left: box.x + box.w + 8 / zoom, top: box.y, transform: `scale(${1 / zoom})`, transformOrigin: "0 0" }}
    >
      <span className="mr-1 text-amber-500">i</span>
      {line}
      <span className="kd-caret" />
      <span className="text-muted-foreground opacity-60">{ghost(line)}</span>
    </div>
  )
}
