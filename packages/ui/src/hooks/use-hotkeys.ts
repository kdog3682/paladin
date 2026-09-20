import { useEffect, useMemo } from 'react'
import { useLatest } from './use-latest'

export type HotkeyHandler = (e: KeyboardEvent) => void

/* keys are combos like 'alt+n', 'alt+shift+1', 'alt+ArrowUp'.
   modifiers: alt|opt|option, ctrl|control, meta|cmd, shift. */
export type HotkeyMap = Record<string, HotkeyHandler>

export type UseHotkeysOpts = {
  /* pause every binding without unmounting. defaults to true */
  enabled?: boolean
  /* listen during capture so editor keymaps never see the event. defaults to true */
  capture?: boolean
  /* what to bind to. defaults to document */
  target?: EventTarget | null
}

type Combo = {
  code: string
  alt: boolean
  ctrl: boolean
  meta: boolean
  shift: boolean
}

/* match on e.code, not e.key: holding alt on macOS rewrites e.key
   ('n' -> '˜', '1' -> '¡'), which makes key-based matching unusable. */
const toCode = (key: string) => {
  if (/^[a-z]$/i.test(key)) return `Key${key.toUpperCase()}`
  if (/^[0-9]$/.test(key)) return `Digit${key}`
  return key
}

const parse = (spec: string): Combo => {
  const parts = spec.split('+').map(p => p.trim())
  const key = parts.pop() ?? ''
  const mods = parts.map(p => p.toLowerCase())
  return {
    code: toCode(key),
    alt: mods.includes('alt') || mods.includes('opt') || mods.includes('option'),
    ctrl: mods.includes('ctrl') || mods.includes('control'),
    meta: mods.includes('meta') || mods.includes('cmd'),
    shift: mods.includes('shift'),
  }
}

const matches = (e: KeyboardEvent, c: Combo) =>
  e.code === c.code &&
  e.altKey === c.alt &&
  e.ctrlKey === c.ctrl &&
  e.metaKey === c.meta &&
  e.shiftKey === c.shift

export const useHotkeys = (map: HotkeyMap, opts: UseHotkeysOpts = {}) => {
  const { enabled = true, capture = true, target } = opts
  const latest = useLatest(map)
  const specs = Object.keys(map)
  const combos = useMemo(() => specs.map(spec => [spec, parse(spec)] as const), [specs.join('|')])

  useEffect(() => {
    if (!enabled) return
    const node = target ?? document
    const onKeyDown = (ev: Event) => {
      const e = ev as KeyboardEvent
      const hit = combos.find(([, c]) => matches(e, c))
      if (!hit) return
      e.preventDefault()
      e.stopPropagation()
      latest.current[hit[0]]?.(e)
    }
    node.addEventListener('keydown', onKeyDown, capture)
    return () => node.removeEventListener('keydown', onKeyDown, capture)
  }, [enabled, capture, target, combos, latest])
}
