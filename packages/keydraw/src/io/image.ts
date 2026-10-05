import { elements } from "../model/geometry"
import { currentRoot } from "../model/tree"
import { S } from "../store/useEditor"

/* triggers a browser download */
export function download(name: string, data: string | Blob, type = "text/plain"): void {
  const blob = typeof data === "string" ? new Blob([data], { type }) : data
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/* the current artboard's element, measured at 100% regardless of viewport zoom */
async function render(kind: "png" | "svg"): Promise<string> {
  const el = elements.get(currentRoot(S().doc))
  if (!el) throw new Error("artboard is not rendered")
  const { toPng, toSvg } = await import("html-to-image")
  const board = S().doc.boards[S().doc.currentBoard]
  const { scale, background } = S().defaults.export
  const opts = {
    width: board.width,
    height: board.height,
    pixelRatio: scale,
    style: { transform: "none", ...(background ? {} : { background: "transparent" }) },
  }
  return kind === "png" ? toPng(el, opts) : toSvg(el, opts)
}

export async function exportImage(kind: "png" | "svg"): Promise<void> {
  const url = await render(kind)
  const name = `${S().doc.boards[S().doc.currentBoard].name}.${kind}`
  const a = document.createElement("a")
  a.href = url
  a.download = name
  a.click()
}
