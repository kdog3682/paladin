import { useShallow } from "zustand/react/shallow"
import { cmdGhost } from "../cmdline/complete"
import { ghost } from "../input-mode/complete"
import { useEditor } from "../store/useEditor"

/* the command line while typing (§12), also the input-mode line: `:` prompt, ghost completion, live preview happens on the canvas */
export function CmdLine() {
  const mode = useEditor(s => s.mode)
  const cmdLine = useEditor(s => s.cmd.line)
  const inputLine = useEditor(s => s.line)
  const names = useEditor(useShallow(s => Object.keys(s.components)))
  if (mode !== "command" && mode !== "input") return null
  const input = mode === "input"
  const line = input ? inputLine : cmdLine

  return (
    <div className="flex h-8 shrink-0 items-center gap-2 border-t bg-background px-3 font-mono text-sm">
      <span className={input ? "text-xs text-amber-500" : "text-muted-foreground"}>{input ? "i" : ":"}</span>
      <span>{line}</span>
      <span className="kd-caret" />
      <span className="text-muted-foreground opacity-60">{input ? ghost(line) : cmdGhost(line, names)}</span>
    </div>
  )
}
