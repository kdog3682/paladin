import { icons } from "lucide-react"
import { memo, useCallback, useRef } from "react"
import { pascal } from "../icons/catalog"
import { elements } from "../model/geometry"
import { useEditor } from "../store/useEditor"
import { nodeStyle } from "./style"

function Caret() {
  return <span className="kd-caret" aria-hidden />
}

export const NodeView = memo(function NodeView({ id }: { id: string }) {
  const node = useEditor(s => (s.draft ?? s.doc).nodes[id])
  const parent = useEditor(s => {
    const d = s.draft ?? s.doc
    const p = d.nodes[id]?.parent
    return p ? d.nodes[p] : null
  })
  // shadow presets are edited in the defaults modal; re-render so their css updates
  useEditor(s => s.defaults.shadows)
  const caret = useEditor(s => s.mode === "text" && s.text?.target === id)
  const mounted = useRef<HTMLElement | null>(null)
  const ref = useCallback(
    (el: HTMLElement | null) => {
      if (el) elements.set(id, el)
      else if (elements.get(id) === mounted.current) elements.delete(id)
      mounted.current = el
    },
    [id],
  )

  if (!node) return null
  const style = nodeStyle(node, parent)
  const kids = node.children.map(c => <NodeView key={c} id={c} />)

  if (node.kind === "text") {
    if (node.inline) {
      return (
        <span ref={ref} data-node={id} style={style}>
          {node.text}
          {caret && <Caret />}
          {kids}
        </span>
      )
    }
    return (
      <div ref={ref} data-node={id} style={style}>
        {node.text}
        {caret && <Caret />}
        {kids}
      </div>
    )
  }

  if (node.kind === "icon") {
    const Icon = node.icon ? icons[pascal(node.icon) as keyof typeof icons] : undefined
    return (
      <div ref={ref} data-node={id} style={style}>
        {Icon && <Icon width="100%" height="100%" />}
        {kids}
      </div>
    )
  }

  return (
    <div ref={ref} data-node={id} style={style}>
      {kids}
    </div>
  )
})
