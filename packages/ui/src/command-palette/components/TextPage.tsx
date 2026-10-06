import { useEffect, useLayoutEffect, useRef } from "react"
import { usePalette, useTopPage } from "../context"

const MAX_HEIGHT = 240

export function TextPage() {
  const palette = usePalette()
  const page = useTopPage()
  const ref = useRef<HTMLTextAreaElement>(null)
  const text = page.type === "text" ? page.text : ""

  /* grow with content up to MAX_HEIGHT, then scroll */
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`
    el.style.overflowY = el.scrollHeight > MAX_HEIGHT ? "auto" : "hidden"
  }, [text])

  /* text carried over from keyword entry: place the caret at the end */
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  }, [])

  if (page.type !== "text") return null

  return (
    <div className="border-b px-3 py-2.5">
      <textarea
        ref={ref}
        rows={3}
        value={text}
        placeholder={page.command.placeholder ?? page.command.title}
        onChange={(e) => palette.actions.setText(e.target.value)}
        className="placeholder:text-muted-foreground block w-full resize-none bg-transparent text-sm leading-6 outline-none"
      />
    </div>
  )
}
