// src/lib/keybindings.ts

import { useEffect, useRef } from 'react'
import { create } from 'zustand'

// ─── Types ───────────────────────────────────────────────────────────

type KeyCombo = string

export interface KeyBinding {
  keys: KeyCombo
  label: string
  action: () => void
  allowInInput?: boolean
}

type LayerType = 'shell' | 'global' | 'applet' | 'overlay'

interface KeyLayer {
  id: string
  type: LayerType
  bindings: Map<KeyCombo, KeyBinding>
  priority: number
}

interface KeybindingState {
  layers: Map<string, KeyLayer>
  activeApplet: string | null

  registerLayer: (id: string, type: LayerType, bindings: KeyBinding[], priority: number) => void
  removeLayer: (id: string) => void
  setActiveApplet: (id: string | null) => void
  resolve: (combo: KeyCombo) => KeyBinding | undefined
  getActiveBindings: () => { type: LayerType, bindings: KeyBinding[] }[]
}

// ─── Constants ───────────────────────────────────────────────────────

export const LAYER_PRIORITY = {
  SHELL: 0,
  GLOBAL: 10,
  APPLET: 20,
  OVERLAY: 50,
} as const

const KEY_ALIASES: Record<string, string> = {
  arrowleft: 'left',
  arrowright: 'right',
  arrowup: 'up',
  arrowdown: 'down',
  ' ': 'space',
  escape: 'esc',
}

const MODIFIER_KEYS = new Set(['control', 'meta', 'alt', 'shift'])

// ─── Store ───────────────────────────────────────────────────────────

export const useKeybindingStore = create<KeybindingState>((set, get) => ({
  layers: new Map(),
  activeApplet: null,

  registerLayer(id, type, bindings, priority) {
    set(state => {
      const next = new Map(state.layers)
      const bindingMap = new Map<KeyCombo, KeyBinding>()
      for (const b of bindings) {
        bindingMap.set(b.keys, b)
      }
      next.set(id, { id, type, bindings: bindingMap, priority })
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
        layer.type === 'shell' ||
        layer.type === 'global' ||
        layer.type === 'overlay' ||
        (layer.type === 'applet' && layer.id === activeApplet)
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
    const result: { type: LayerType, bindings: KeyBinding[] }[] = []

    const relevant = [...layers.values()]
      .filter(layer =>
        layer.type === 'shell' ||
        layer.type === 'global' ||
        layer.type === 'overlay' ||
        (layer.type === 'applet' && layer.id === activeApplet)
      )
      .sort((a, b) => a.priority - b.priority)

    for (const layer of relevant) {
      result.push({
        type: layer.type,
        bindings: [...layer.bindings.values()],
      })
    }

    return result
  },
}))

// ─── Key normalization ───────────────────────────────────────────────

export function normalizeKeyEvent(e: KeyboardEvent): KeyCombo {
  const key = e.key.toLowerCase()
  if (MODIFIER_KEYS.has(key)) return ''

  const parts: string[] = []
  if (e.ctrlKey || e.metaKey) parts.push('ctrl')
  if (e.altKey) parts.push('alt')
  if (e.shiftKey) parts.push('shift')
  parts.push(KEY_ALIASES[key] ?? key)

  return parts.join('+')
}

// ─── Root listener ───────────────────────────────────────────────────

export function useKeybindingListener() {
  const resolve = useKeybindingStore(s => s.resolve)

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const combo = normalizeKeyEvent(e)
      if (!combo) return

      const tag = (e.target as HTMLElement)?.tagName
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'

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

// ─── Hooks ───────────────────────────────────────────────────────────

export function useRegisterLayer(
  id: string,
  type: LayerType,
  bindings: KeyBinding[],
  priority: number,
) {
  const registerLayer = useKeybindingStore(s => s.registerLayer)
  const removeLayer = useKeybindingStore(s => s.removeLayer)

  useEffect(() => {
    registerLayer(id, type, bindings, priority)
    return () => removeLayer(id)
  }, [id, type, bindings, priority, registerLayer, removeLayer])
}

export function useOverlayKeybindings(id: string, bindings: KeyBinding[]) {
  useRegisterLayer(id, 'overlay', bindings, LAYER_PRIORITY.OVERLAY)
}

export function useAppletKeybindings(id: string, bindings: KeyBinding[]) {
  useRegisterLayer(id, 'applet', bindings, LAYER_PRIORITY.APPLET)
}
