// @paladin/scribe-ui/src/keybindings.tsx

import { createContext, useContext, useCallback, useEffect, useRef } from "react"

export type KeyBinding = {
  key: string
  meta?: boolean
  shift?: boolean
  description: string
  handler: (e: KeyboardEvent) => void
}

type KeyBindingContextValue = {
  register: (id: string, bindings: KeyBinding[]) => void
  unregister: (id: string) => void
  getAll: () => KeyBinding[]
}

const KeyBindingContext = createContext<KeyBindingContextValue | null>(null)

export function KeyBindingProvider({ children }: { children: React.ReactNode }) {
  const registryRef = useRef<Map<string, KeyBinding[]>>(new Map())

  const register = useCallback((id: string, bindings: KeyBinding[]) => {
    registryRef.current.set(id, bindings)
  }, [])

  const unregister = useCallback((id: string) => {
    registryRef.current.delete(id)
  }, [])

  const getAll = useCallback(() => {
    const all: KeyBinding[] = []
    for (const bindings of registryRef.current.values()) {
      all.push(...bindings)
    }
    return all
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const inInput =
        target.tagName === "TEXTAREA" ||
        target.tagName === "INPUT" ||
        target.isContentEditable

      // tab always works even in inputs (for panel toggle)
      // cmd shortcuts always work
      const isMeta = e.metaKey || e.ctrlKey

      // Iterate bindings in reverse insertion order (latest takes priority)
      const entries = [...registryRef.current.entries()].reverse()
      for (const [, bindings] of entries) {
        for (const binding of bindings) {
          const keyMatch = e.key.toLowerCase() === binding.key.toLowerCase()
          const metaMatch = binding.meta ? isMeta : !isMeta
          const shiftMatch = binding.shift ? e.shiftKey : !e.shiftKey

          if (!keyMatch || !metaMatch || !shiftMatch) continue

          // If we're in an input, only allow meta shortcuts, tab, and escape
          if (inInput && !binding.meta && binding.key !== "Tab" && binding.key !== "Escape") {
            continue
          }

          e.preventDefault()
          e.stopPropagation()
          binding.handler(e)
          return
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])

  return (
    <KeyBindingContext.Provider value={{ register, unregister, getAll }}>
      {children}
    </KeyBindingContext.Provider>
  )
}

export function useKeyBindings(id: string, bindings: KeyBinding[], deps: unknown[] = []) {
  const ctx = useContext(KeyBindingContext)
  if (!ctx) throw new Error("useKeyBindings must be used within KeyBindingProvider")

  useEffect(() => {
    ctx.register(id, bindings)
    return () => ctx.unregister(id)
  }, [id, ...deps])
}

export function useKeyBindingContext() {
  const ctx = useContext(KeyBindingContext)
  if (!ctx) throw new Error("useKeyBindingContext must be used within KeyBindingProvider")
  return ctx
}
