import { useState } from "react"
import type { ImageBlock } from "../lib/api"

const size = (n: number) => (n < 1024 * 1024 ? `${Math.round(n / 1024)}KB` : `${(n / 1024 / 1024).toFixed(1)}MB`)

/** a thumbnail that is only fetched on first click. click the image to go full size, again to shrink */
export function ImageResult({ image }: { image: ImageBlock }) {
  const [state, setState] = useState<"closed" | "thumb" | "full">("closed")
  if (state === "closed") {
    return (
      <button
        onClick={() => setState("thumb")}
        className="rounded border border-neutral-200 bg-neutral-50 px-2 py-1 text-xs text-neutral-500 hover:border-neutral-400"
      >
        🖼 {image.mediaType} · {size(image.bytes)} · click to load
      </button>
    )
  }
  return (
    <div>
      <img
        src={image.src}
        onClick={() => setState(state === "thumb" ? "full" : "thumb")}
        className={`rounded border border-neutral-200 ${
          state === "thumb" ? "max-h-40 max-w-xs cursor-zoom-in" : "max-w-full cursor-zoom-out"
        }`}
      />
      <button onClick={() => setState("closed")} className="mt-1 block text-[11px] text-neutral-400 hover:text-neutral-600">
        hide
      </button>
    </div>
  )
}
