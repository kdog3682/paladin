import type { Pad } from "../props/registry"

/* rendered element per node id, registered by NodeView */
export const elements = new Map<string, HTMLElement>()

/* the viewport element, registered by Viewport */
export const viewportEl: { current: HTMLElement | null } = { current: null }

export type Box = { x: number, y: number, w: number, h: number }

/* layout box relative to the offset parent (the node's parent), unaffected by zoom */
export function offsetBox(id: string): Box | null {
  const el = elements.get(id)
  if (!el?.isConnected) return null
  return { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight }
}

export function paddingOf(id: string): Pad | null {
  const el = elements.get(id)
  if (!el?.isConnected) return null
  const cs = getComputedStyle(el)
  return {
    l: parseFloat(cs.paddingLeft) || 0,
    r: parseFloat(cs.paddingRight) || 0,
    t: parseFloat(cs.paddingTop) || 0,
    b: parseFloat(cs.paddingBottom) || 0,
  }
}

/* box of a node in artboard coordinates (unscaled), measured from the dom */
export function boxIn(id: string, rootId: string, zoom: number): Box | null {
  const el = elements.get(id)
  const root = elements.get(rootId)
  if (!el?.isConnected || !root?.isConnected) return null
  const r = el.getBoundingClientRect()
  const a = root.getBoundingClientRect()
  return {
    x: (r.left - a.left) / zoom,
    y: (r.top - a.top) / zoom,
    w: r.width / zoom,
    h: r.height / zoom,
  }
}

export function viewportSize(): { w: number, h: number } {
  const el = viewportEl.current
  return el ? { w: el.clientWidth, h: el.clientHeight } : { w: 1200, h: 800 }
}
