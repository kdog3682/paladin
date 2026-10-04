import { paint } from "@mathpen/manim/src/render/paint"
import { viewOf } from "@mathpen/manim/src/render/camera"
import { serializeScene } from "@mathpen/manim/src/render/serialize"
import { isRecipe } from "@mathpen/manim/src/layout/recipe"
import type { VMobject as Cobject } from "@mathpen/manim/src/mobject/vmobject"

const POINT = 96 / 72

/** a bare recipe wraps to this when nothing else resolves it */
const AVAILABLE = { width: 480, height: 640 }

/** anything an example may return: a mobject, a recipe, or an array of either */
function items(value: unknown): Cobject[] {
  if (Array.isArray(value)) return value.flatMap(items)
  if (value == null || typeof value !== "object") return []
  const obj = value as Cobject
  return [isRecipe(obj) ? (obj.resolve(AVAILABLE) as Cobject) : obj]
}

/**
 * paints an example onto a canvas, sized to its content. scene units are points,
 * so zoom 1 is the natural size. returns false when there was nothing to draw
 */
export function draw(canvas: HTMLCanvasElement, value: unknown, zoom: number): boolean {
  const objs = items(value)
  if (objs.length === 0) return false

  const dpr = window.devicePixelRatio || 1
  const doc = serializeScene(objs, { backgroundColor: "#ffffff" })
  const view = viewOf(doc.bounds, { dimensions: "fit", buff: 12, zoom, pixelsPerPoint: dpr * POINT })

  canvas.width = view.pixelWidth
  canvas.height = view.pixelHeight
  canvas.style.width = `${view.pixelWidth / dpr}px`
  canvas.style.height = `${view.pixelHeight / dpr}px`

  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("2d context unavailable")
  paint(ctx, doc, view)
  return true
}
