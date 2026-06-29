import { useSyncExternalStore } from 'react'
import type { Assembled } from './build'
import type { Ctx, NormalBinding } from './features/types'

export type Mode = 'insert' | 'normal' | 'command' | 'search'

// tiny external store so non-react code (the chord resolver) can read mode too.
let mode: Mode = 'insert'
const subs = new Set<() => void>()

export const getMode = (): Mode => mode
export function setMode(m: Mode) {
  if (m === mode) return
  mode = m
  subs.forEach((fn) => fn())
}
function subscribe(fn: () => void) {
  subs.add(fn)
  return () => subs.delete(fn)
}
export function useMode(): Mode {
  return useSyncExternalStore(subscribe, getMode)
}

export interface ModeStore {
  get: typeof getMode
  set: typeof setMode
}
export const modeStore: ModeStore = { get: getMode, set: setMode }

// global keys work in ANY mode; normal keys only when mode === 'normal'.
// returns a cleanup fn. App calls this once with the assembled buses + ctx.
export function installGlobalKeys(
  asm: Assembled,
  ctx: Ctx,
  enter: { command: () => void; search: () => void; save: () => void },
): () => void {
  const normal = new Map<string, NormalBinding>(asm.normal.map((n) => [n.seq, n]))

  const onKey = (e: KeyboardEvent) => {
    // --- global, always active ---
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault()
      enter.save()
      return
    }
    if (e.key === 'Escape') {
      setMode('normal')
      ;(document.activeElement as HTMLElement | null)?.blur()
      return
    }
    // --- normal-mode only ---
    if (getMode() !== 'normal') return
    if (e.key === ':') return enter.command()
    if (e.key === '/') return enter.search()
    const b = normal.get(e.key)
    if (b) {
      e.preventDefault()
      b.run(ctx)
    }
  }

  window.addEventListener('keydown', onKey)
  return () => window.removeEventListener('keydown', onKey)
}
