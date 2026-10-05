import { useEffect, useRef, useState } from "react"
import { draw } from "../lib/draw"
import type { Example } from "../lib/examples"
import { useInView } from "../lib/useInView"

type Props = {
  example: Example
  zoom: number
}

/** one example: its name and docstring over the drawing, which is made when the card scrolls into view */
export function ExampleCard({ example, zoom }: Props) {
  const [ref, seen] = useInView<HTMLElement>()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [empty, setEmpty] = useState(false)

  useEffect(() => {
    if (!seen) return
    let alive = true
    example
      .run()
      .then((value) => {
        const canvas = canvasRef.current
        if (!alive || !canvas) return
        setEmpty(!draw(canvas, value, zoom))
        setError(null)
      })
      .catch((e) => alive && setError(e instanceof Error ? (e.stack ?? e.message) : String(e)))
    return () => {
      alive = false
    }
  }, [seen, example, zoom])

  return (
    <article
      id={example.id}
      ref={ref}
      className="flex min-w-0 flex-col gap-2 rounded-lg border border-neutral-200 bg-white p-3 shadow-sm"
    >
      <header>
        <h3 className="font-mono text-sm font-medium text-neutral-900">{example.name}</h3>
        {example.doc && <p className="mt-0.5 text-xs leading-snug text-neutral-500">{example.doc}</p>}
      </header>

      <div className="flex min-h-24 items-center justify-center overflow-auto rounded bg-neutral-50 p-2">
        {error ? (
          <pre className="max-h-48 w-full overflow-auto whitespace-pre-wrap font-mono text-xs text-red-600">{error}</pre>
        ) : empty ? (
          <span className="text-xs text-neutral-400">nothing drawable</span>
        ) : (
          <canvas ref={canvasRef} className="block max-w-none bg-white" />
        )}
      </div>
    </article>
  )
}
