import type { CSSProperties } from "react"
import { layoutOf } from "../model/tree"
import type { Node } from "../model/types"
import { PROPS, padOf, type CssCtx } from "../props/registry"

const ZERO = { l: 0, r: 0, t: 0, b: 0 }

export function cssCtx(parent: Node | null): CssCtx {
  return {
    parentLayout: parent ? layoutOf(parent) : "root",
    parentDir: parent?.props.flexDir === "col" ? "col" : "row",
    parentPad: parent ? padOf(parent.props) : ZERO,
  }
}

export function nodeStyle(node: Node, parent: Node | null): CSSProperties {
  const ctx = cssCtx(parent)
  const layout = layoutOf(node)
  const style: CSSProperties = {
    boxSizing: "border-box",
    position: ctx.parentLayout === "absolute" ? "absolute" : "relative",
  }
  if (ctx.parentLayout === "absolute") {
    style.left = 0
    style.top = 0
  }
  if (layout === "flex") style.display = "flex"
  else if (layout === "grid") style.display = "grid"
  if (node.kind === "text") style.whiteSpace = "pre-wrap"

  for (const def of PROPS) {
    const v = node.props[def.name]
    if (v !== undefined) Object.assign(style, def.toCss(v, ctx))
  }

  if (!parent) {
    style.width = "100%"
    style.height = "100%"
    style.overflow = "hidden"
  }
  if (node.inline) {
    style.position = "static"
    style.display = "inline"
    delete style.left
    delete style.top
  }
  if (node.shape === "ellipse") style.borderRadius = "50%"
  if (node.shape === "diamond") style.clipPath = "polygon(50% 0, 100% 50%, 50% 100%, 0 50%)"
  // hidden nodes keep their layout and stay measurable, so focus can still rest on them
  if (node.hidden) style.visibility = "hidden"
  return style
}
