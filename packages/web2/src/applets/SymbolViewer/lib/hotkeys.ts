import { useEffect, useRef } from "react"

type AnyKeyEvent = KeyboardEvent | React.KeyboardEvent

export const isMod = (e: AnyKeyEvent) => e.metaKey || e.ctrlKey

export function isTyping(e: AnyKeyEvent): boolean {
  const el = e.target as HTMLElement | null
  if (!el) return false
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)
}

/* combos look like "mod+shift+p", "mod+enter", "f". modifiers must match exactly */
export function matches(e: AnyKeyEvent, combo: string): boolean {
  const parts = combo.toLowerCase().split("+")
  const key = parts.pop()!
  const mod = parts.includes("mod")
  const shift = parts.includes("shift")
  const alt = parts.includes("alt")
  return (
    e.key.toLowerCase() === key &&
    isMod(e) === mod &&
    e.shiftKey === shift &&
    e.altKey === alt
  )
}

/* window-level hotkeys. mod combos fire even while typing, plain keys do not */
export function useGlobalHotkeys(map: Record<string, (e: KeyboardEvent) => void>) {
  const ref = useRef(map)
  ref.current = map
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      for (const [combo, fn] of Object.entries(ref.current)) {
        if (!matches(e, combo)) continue
        if (!combo.includes("mod") && isTyping(e)) continue
        e.preventDefault()
        e.stopPropagation()
        fn(e)
        return
      }
    }
    window.addEventListener("keydown", onKey, { capture: true })
    return () => window.removeEventListener("keydown", onKey, { capture: true })
  }, [])
}
