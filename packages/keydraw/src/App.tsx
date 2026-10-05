import { useEffect } from "react"
import { handleKeyDown } from "./commands/dispatch"
import { Viewport } from "./render/Viewport"
import { useEditor } from "./store/useEditor"
import { AttributesPanel } from "./ui/AttributesPanel"
import { LayerTree } from "./ui/LayerTree"
import { WhichKey } from "./ui/WhichKey"
import { Modals } from "./ui/Modals"
import { CmdLine } from "./ui/CmdLine"
import { SearchLine } from "./ui/SearchLine"
import { StatusLine } from "./ui/StatusLine"

const GLOBAL_CSS = `
.kd-caret {
  display: inline-block;
  width: 1px;
  height: 1em;
  margin-left: 1px;
  vertical-align: text-bottom;
  background: currentColor;
  animation: kd-blink 1s steps(1) infinite;
}
@keyframes kd-blink { 50% { opacity: 0 } }
`

/* the cmd/search/input line takes the status line's place, so the viewport never changes height */
function BottomLine() {
  const typing = useEditor(s => s.mode === "command" || s.mode === "input" || s.mode === "search")
  const mode = useEditor(s => s.mode)
  if (!typing) return <StatusLine />
  return mode === "search" ? <SearchLine /> : <CmdLine />
}

export function App() {
  const showAttrs = useEditor(s => s.defaults.layout.attributesPanel)
  const showLayers = useEditor(s => s.defaults.layout.layerTree)
  const attrsWidth = useEditor(s => s.defaults.layout.attributesWidth)
  useEffect(() => {
    // capture phase: a focused dialog popup must not swallow keys before the dispatcher sees them
    window.addEventListener("keydown", handleKeyDown, true)
    return () => window.removeEventListener("keydown", handleKeyDown, true)
  }, [])

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground">
      <style>{GLOBAL_CSS}</style>
      <div className="flex min-h-0 flex-1">
        {showLayers && <LayerTree />}
        <Viewport />
        {showAttrs && <AttributesPanel width={attrsWidth} />}
      </div>
      <WhichKey />
      <Modals />
      <BottomLine />
    </div>
  )
}

export default App
