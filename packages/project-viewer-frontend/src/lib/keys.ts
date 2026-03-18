// @paladin/project-viewer-frontend/src/lib/keys.ts
//
// Global keyboard handler. Binds once at mount, unbinds on cleanup.
// Bails early when focus is inside an input/textarea so typing
// doesn't trigger shortcuts.

import { useEffect } from "react"
import { useStore } from "./store"

/** Returns true if the active element is a text input. */
function inInput(): boolean {
  const el = document.activeElement
  if (!el) return false
  const tag = el.tagName.toLowerCase()
  if (tag === "textarea" || tag === "input") return true
  if ((el as HTMLElement).isContentEditable) return true
  return false
}

/** Hook — registers all global keybindings. Call once in App. */
export function useKeys() {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const store = useStore.getState()

      // cmd+k always works, even in inputs
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault()
        store.setCmdkOpen(!store.cmdkOpen)
        return
      }

      // everything below is blocked while in text fields
      if (inInput()) return

      switch (e.key) {
        case "Tab": {
          e.preventDefault()
          store.cycleTab()
          // if landing on notepad, focus the textarea next tick
          const next = ["viewer", "config", "notepad"]
          const i = next.indexOf(store.tab)
          const target = next[(i + 1) % next.length]
          if (target === "notepad") {
            requestAnimationFrame(() => {
              document.getElementById("notepad-textarea")?.focus()
            })
          }
          break
        }

        case "ArrowUp":
        case "k": {
          e.preventDefault()
          store.moveCursor(-1)
          break
        }

        case "ArrowDown":
        case "j": {
          e.preventDefault()
          store.moveCursor(1)
          break
        }

        case "s": {
          store.toggleBookmark()
          break
        }

        case "/": {
          e.preventDefault()
          store.setGrepOpen(true)
          break
        }

        case "Escape": {
          if (store.grepOpen) store.setGrepOpen(false)
          else if (store.cmdkOpen) store.setCmdkOpen(false)
          break
        }
      }
    }

    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [])
}
