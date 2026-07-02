import type { KeyBinding } from '@codemirror/view'
import type { AppContext, GlobalBinding } from './types'

// canonical key string for any KeyboardEvent — 'Mod-Shift-n', 'Escape', 'n', ' '.
// the single source of truth for key-string normalization; nothing else should roll its own.
export function normalizeKey(e: KeyboardEvent): string {
  const parts: string[] = []
  if (e.ctrlKey || e.metaKey) parts.push('Mod')
  if (e.shiftKey) parts.push('Shift')
  if (e.altKey) parts.push('Alt')
  parts.push(e.key.length === 1 ? e.key.toLowerCase() : e.key)
  return parts.join('-')
}

export function installGlobalKeymap(ctx: AppContext, bindings: readonly GlobalBinding[]): () => void {
  const handler = (e: KeyboardEvent) => {
    if (!(e.ctrlKey || e.metaKey)) return
    const binding = bindings.find((b) => b.key === normalizeKey(e))
    if (!binding) return
    e.preventDefault()
    binding.run(ctx)
  }
  window.addEventListener('keydown', handler)
  return () => window.removeEventListener('keydown', handler)
}

// editor-focused keymap (CM6 native, insert mode only)
export function editorKeymap(ctx: AppContext): KeyBinding[] {
  return [
    {
      key: 'Escape',
      run: (view) => {
        view.contentDOM.blur()
        ctx.store.getState().setMode('normal')
        return true
      },
    },
  ]
}
