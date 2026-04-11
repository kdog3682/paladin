// src/lib/keybindings.ts

import { useEffect } from 'react'
import { create } from 'zustand'

// ─── Types ───────────────────────────────────────────────────────────

type KeyCombo = string

interface KeyBinding {
  keys: KeyCombo
  label: string
  action: () => void
  allowInInput?: boolean
}

interface KeyLayer {
  id: string
  bindings: Map<KeyCombo, KeyBinding>
  priority: number
}

interface KeybindingState {
  layers: Map<string, KeyLayer>
  activeApplet: string | null

  registerLayer: (id: string, bindings: KeyBinding[], priority: number) => void
  removeLayer: (id: string) => void
  setActiveApplet: (id: string | null) => void
  resolve: (combo: KeyCombo) => KeyBinding | undefined
  getActiveBindings: () => KeyBinding[]
}

// ─── Constants ───────────────────────────────────────────────────────

export const LAYER_PRIORITY = {
  SHELL: 0,
  GLOBAL: 10,
  APPLET: 20,
} as const

const KEY_ALIASES: Record<string, string> = {
  arrowleft: 'left',
  arrowright: 'right',
  arrowup: 'up',
  arrowdown: 'down',
  ' ': 'space',
  escape: 'esc',
}

// ─── Store ───────────────────────────────────────────────────────────

export const useKeybindingStore = create<KeybindingState>((set, get) => ({
  layers: new Map(),
  activeApplet: null,

  registerLayer(id, bindings, priority) {
    set(state => {
      const next = new Map(state.layers)
      const bindingMap = new Map<KeyCombo, KeyBinding>()

      for (const b of bindings) {
        bindingMap.set(b.keys, b)
      }

      next.set(id, { id, bindings: bindingMap, priority })
      return { layers: next }
    })
  },

  removeLayer(id) {
    set(state => {
      const next = new Map(state.layers)
      next.delete(id)
      return { layers: next }
    })
  },

  setActiveApplet(id) {
    set({ activeApplet: id })
  },

  resolve(combo) {
    const { layers, activeApplet } = get()

    const relevant = [...layers.values()]
      .filter(layer =>
        layer.id === 'shell' ||
        layer.id === 'global' ||
        layer.id === activeApplet
      )
      .sort((a, b) => b.priority - a.priority)

    for (const layer of relevant) {
      const binding = layer.bindings.get(combo)
      if (binding) return binding
    }

    return undefined
  },

  getActiveBindings() {
    const { layers, activeApplet } = get()
    const merged = new Map<KeyCombo, KeyBinding>()

    const relevant = [...layers.values()]
      .filter(layer =>
        layer.id === 'shell' ||
        layer.id === 'global' ||
        layer.id === activeApplet
      )
      .sort((a, b) => a.priority - b.priority)

    for (const layer of relevant) {
      for (const [keys, binding] of layer.bindings) {
        merged.set(keys, binding)
      }
    }

    return [...merged.values()]
  },
}))

// ─── Key normalization ───────────────────────────────────────────────

export function normalizeKeyEvent(e: KeyboardEvent): KeyCombo {
  const parts: string[] = []
  if (e.ctrlKey || e.metaKey) parts.push('ctrl')
  if (e.altKey) parts.push('alt')
  if (e.shiftKey) parts.push('shift')

  const key = e.key.toLowerCase()
  parts.push(KEY_ALIASES[key] ?? key)
  return parts.join('+')
}

// ─── Root listener ───────────────────────────────────────────────────

export function useKeybindingListener() {
  const resolve = useKeybindingStore(s => s.resolve)

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'

      const combo = normalizeKeyEvent(e)
      const binding = resolve(combo)

      if (!binding) return
      if (isInput && !binding.allowInInput) return

      e.preventDefault()
      binding.action()
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [resolve])
}

// ─── Applet hook ─────────────────────────────────────────────────────

export function useAppletKeybindings(appletId: string, bindings: KeyBinding[]) {
  const registerLayer = useKeybindingStore(s => s.registerLayer)
  const removeLayer = useKeybindingStore(s => s.removeLayer)

  useEffect(() => {
    registerLayer(appletId, bindings, LAYER_PRIORITY.APPLET)
    return () => removeLayer(appletId)
  }, [appletId, bindings, registerLayer, removeLayer])
}
