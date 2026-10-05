import { useEffect, useRef, useState } from "react"
import { cn } from "@paladin/shadcn"

export type InlineRenameProps = {
  initial: string
  /* select the name without its extension, like vscode */
  selectStem?: boolean
  /* return false to keep editing, ie when the name is invalid */
  onSubmit: (value: string) => boolean | void
  onCancel: () => void
  className?: string
}

/*
 * enter commits, escape cancels, clicking anywhere else commits.
 * blur is deliberately ignored: a closing context menu can shuffle focus, and that must not end the edit.
 */
export function InlineRename({ initial, selectStem, onSubmit, onCancel, className }: InlineRenameProps) {
  const [value, setValue] = useState(initial)
  const ref = useRef<HTMLInputElement>(null)
  const valueRef = useRef(value)
  valueRef.current = value

  const submit = () => {
    const v = valueRef.current.trim()
    if (!v || v === initial) return onCancel()
    if (onSubmit(v) === false) ref.current?.focus()
  }
  const submitRef = useRef(submit)
  submitRef.current = submit

  /* focus after the context menu has finished closing */
  const mountedAt = useRef(performance.now())
  useEffect(() => {
    const focus = () => {
      const el = ref.current
      if (!el || document.activeElement === el) return
      el.focus({ preventScroll: true })
      const dot = selectStem ? initial.lastIndexOf(".") : -1
      el.setSelectionRange(0, dot > 0 ? dot : initial.length)
    }
    const frame = requestAnimationFrame(focus)
    const late = setTimeout(focus, 200)
    return () => {
      cancelAnimationFrame(frame)
      clearTimeout(late)
    }
  }, [])

  /* commit on a click outside. registered a tick late so the right click that started this doesn't count */
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) submitRef.current()
    }
    const t = setTimeout(() => document.addEventListener("pointerdown", onDown, true), 0)
    return () => {
      clearTimeout(t)
      document.removeEventListener("pointerdown", onDown, true)
    }
  }, [])

  return (
    <input
      ref={ref}
      value={value}
      spellCheck={false}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        /* keep f / h / j / k / arrows from reaching the card and tree handlers */
        e.stopPropagation()
        if (e.key === "Enter") {
          e.preventDefault()
          submit()
        } else if (e.key === "Escape") {
          e.preventDefault()
          onCancel()
        }
      }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.stopPropagation()}
      onFocus={(e) => e.stopPropagation()}
      onBlur={() => {
        /* base ui hands focus back to the menu trigger as the menu animates out. take it back */
        if (performance.now() - mountedAt.current < 800) requestAnimationFrame(() => ref.current?.focus())
      }}
      className={cn(
        "h-6 w-full min-w-0 rounded-sm border border-ring bg-background px-1.5 font-mono text-xs outline-none ring-2 ring-ring/30",
        className,
      )}
    />
  )
}
