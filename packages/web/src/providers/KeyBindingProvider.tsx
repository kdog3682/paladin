// @paladin/web/src/providers/KeyBindingProvider.tsx
import { createContext, useContext, useCallback, useRef, useEffect, type ReactNode } from 'react'

export type KeyBinding = {
  key: string
  description: string
  handler: () => void
  scope: string
}

type KeyBindingLayer = {
  id: string
  scope: string
  bindings: Map<string, KeyBinding>
  priority: number
}

type KeyBindingContextValue = {
  register: (layerId: string, scope: string, bindings: KeyBinding[]) => void
  unregister: (layerId: string) => void
  getActiveBindings: () => KeyBinding[]
  suppress: (suppressed: boolean) => void
}

const KeyBindingContext = createContext<KeyBindingContextValue | null>(null)

let layerCounter = 0

export function KeyBindingProvider({ children }: { children: ReactNode }) {
  const layersRef = useRef<Map<string, KeyBindingLayer>>(new Map())
  const suppressedRef = useRef(false)

  const register = useCallback((layerId: string, scope: string, bindings: KeyBinding[]) => {
    const map = new Map<string, KeyBinding>()
    for (const b of bindings) map.set(b.key, b)
    layersRef.current.set(layerId, {
      id: layerId,
      scope,
      bindings: map,
      priority: layerCounter++,
    })
  }, [])

  const unregister = useCallback((layerId: string) => {
    layersRef.current.delete(layerId)
  }, [])

  const getActiveBindings = useCallback(() => {
    const all: KeyBinding[] = []
    const seen = new Set<string>()
    const sorted = [...layersRef.current.values()].sort((a, b) => b.priority - a.priority)
    for (const layer of sorted) {
      for (const [key, binding] of layer.bindings) {
        if (!seen.has(key)) {
          seen.add(key)
          all.push(binding)
        }
      }
    }
    return all
  }, [])

  const suppress = useCallback((suppressed: boolean) => {
    suppressedRef.current = suppressed
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (suppressedRef.current) return
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

      const sorted = [...layersRef.current.values()].sort((a, b) => b.priority - a.priority)
      for (const layer of sorted) {
        const binding = layer.bindings.get(e.key)
        if (binding) {
          e.preventDefault()
          binding.handler()
          return
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <KeyBindingContext.Provider value={{ register, unregister, getActiveBindings, suppress }}>
      {children}
    </KeyBindingContext.Provider>
  )
}

export function useKeyBindings() {
  const ctx = useContext(KeyBindingContext)
  if (!ctx) throw new Error('useKeyBindings must be used within KeyBindingProvider')
  return ctx
}

export function useRegisterBindings(layerId: string, scope: string, bindings: KeyBinding[], deps: unknown[] = []) {
  const { register, unregister } = useKeyBindings()

  useEffect(() => {
    register(layerId, scope, bindings)
    return () => unregister(layerId)
  }, [layerId, scope, ...deps])
}
