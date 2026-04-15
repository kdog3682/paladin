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

export type KeyFallback = (combo: KeyCombo, e: KeyboardEvent) => boolean | void

type LayerType = 'shell' | 'global' | 'applet' | 'overlay'

interface KeyLayer {
  id: string
  type: LayerType
  bindings: Map<KeyCombo, KeyBinding>
  fallback: KeyFallback | null
  priority: number
}

interface KeybindingState {
  layers: Map<string, KeyLayer>
  activeApplet: string | null

  registerLayer: (id: string, type: LayerType, bindings: KeyBinding[], priority: number, fallback?: KeyFallback) => void
  removeLayer: (id: string) => void
  setActiveApplet: (id: string | null) => void
  resolve: (combo: KeyCombo) => KeyBinding | undefined
  resolveFallback: () => KeyFallback | null
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

  registerLayer(id, type, bindings, priority, fallback) {
    set(state => {
      const next = new Map(state.layers)
      const bindingMap = new Map<KeyCombo, KeyBinding>()
      for (const b of bindings) {
        bindingMap.set(b.keys, b)
      }
      next.set(id, { id, type, bindings: bindingMap, fallback: fallback ?? null, priority })
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

  resolveFallback() {
    const { layers, activeApplet } = get()

    // check layers in priority order for a fallback
    const relevant = [...layers.values()]
      .filter(layer =>
        layer.type === 'shell' ||
        layer.type === 'global' ||
        layer.type === 'overlay' ||
        (layer.type === 'applet' && layer.id === activeApplet)
      )
      .sort((a, b) => b.priority - a.priority)

    for (const layer of relevant) {
      if (layer.fallback) return layer.fallback
    }

    return null
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
  const resolveFallback = useKeybindingStore(s => s.resolveFallback)

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const combo = normalizeKeyEvent(e)
      if (!combo) return

      const tag = (e.target as HTMLElement)?.tagName
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'

      const binding = resolve(combo)
      if (binding) {
        if (isInput && !binding.allowInInput) return
        e.preventDefault()
        binding.action()
        return
      }

      // no binding matched — try the active layer's fallback
      if (!isInput) {
        const fallback = resolveFallback()
        if (fallback) {
          const handled = fallback(combo, e)
          if (handled !== false) {
            e.preventDefault()
          }
        }
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [resolve, resolveFallback])
}

// ─── Hooks ───────────────────────────────────────────────────────────

interface LayerOptions {
  fallback?: KeyFallback
}

export function useRegisterLayer(
  id: string,
  type: LayerType,
  bindings: KeyBinding[],
  priority: number,
  options?: LayerOptions,
) {
  const registerLayer = useKeybindingStore(s => s.registerLayer)
  const removeLayer = useKeybindingStore(s => s.removeLayer)
  const fallbackRef = useRef(options?.fallback)
  fallbackRef.current = options?.fallback

  useEffect(() => {
    const stableFallback: KeyFallback | undefined = options?.fallback
      ? (combo, e) => fallbackRef.current?.(combo, e)
      : undefined
    registerLayer(id, type, bindings, priority, stableFallback)
    return () => removeLayer(id)
  }, [id, type, bindings, priority, registerLayer, removeLayer])
}

export function useOverlayKeybindings(id: string, bindings: KeyBinding[], options?: LayerOptions) {
  useRegisterLayer(id, 'overlay', bindings, LAYER_PRIORITY.OVERLAY, options)
}

export function useAppletKeybindings(id: string, bindings: KeyBinding[], options?: LayerOptions) {
  useRegisterLayer(id, 'applet', bindings, LAYER_PRIORITY.APPLET, options)
}
