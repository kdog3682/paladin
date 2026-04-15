// src/components/HelpPalette/HelpPalette.tsx

import { useState, useMemo, useCallback } from 'react'
import { cn } from '@bklearn/shadcn'
import { X } from 'lucide-react'
import { useKeybindingStore, useOverlayKeybindings } from '@/lib/keybindings'

interface HelpPaletteProps {
  onClose: () => void
}

type Tab = 'applet' | 'general'

export function HelpPalette({ onClose }: HelpPaletteProps) {
  const [tab, setTab] = useState<Tab>('applet')
  const layers = useKeybindingStore(s => s.layers)
  const activeApplet = useKeybindingStore(s => s.activeApplet)

  const toggleTab = useCallback(() => {
    setTab(t => t === 'applet' ? 'general' : 'applet')
  }, [])

  const overlayBindings = useMemo(() => [
    { keys: 'esc', label: 'Close help', action: onClose, allowInInput: true },
    { keys: 'ctrl+/', label: 'Close help', action: onClose, allowInInput: true },
    { keys: 'tab', label: 'Switch tab', action: toggleTab, allowInInput: true },
  ], [onClose, toggleTab])

  useOverlayKeybindings('help-palette', overlayBindings)

  const { appletBindings, generalBindings } = useMemo(() => {
    const applet: { keys: string, label: string }[] = []
    const general: { keys: string, label: string }[] = []

    for (const layer of layers.values()) {
      const items = [...layer.bindings.values()]
        .filter(b => !['Close help', 'Switch tab'].includes(b.label))
        .map(b => ({ keys: b.keys, label: b.label }))

      if (layer.type === 'applet' && layer.id === activeApplet) {
        applet.push(...items)
      } else if (layer.type === 'shell' || layer.type === 'global') {
        general.push(...items)
      }
    }

    return { appletBindings: applet, generalBindings: general }
  }, [layers, activeApplet])

  const currentBindings = tab === 'applet' ? appletBindings : generalBindings
  const appletLabel = activeApplet
    ? activeApplet.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    : 'Applet'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="w-full max-w-sm max-h-[60vh] bg-white rounded-lg shadow-xl overflow-hidden flex flex-col">
        {/* header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-100 shrink-0">
          <span className="text-sm font-medium text-neutral-800">Keyboard shortcuts</span>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* tabs */}
        <div className="flex border-b border-neutral-100 shrink-0">
          <button
            onClick={() => setTab('applet')}
            className={cn(
              'flex-1 py-2 text-xs font-medium transition-colors',
              tab === 'applet'
                ? 'text-neutral-900 border-b-2 border-neutral-900'
                : 'text-neutral-400 hover:text-neutral-600',
            )}
          >
            {appletLabel}
          </button>
          <button
            onClick={() => setTab('general')}
            className={cn(
              'flex-1 py-2 text-xs font-medium transition-colors',
              tab === 'general'
                ? 'text-neutral-900 border-b-2 border-neutral-900'
                : 'text-neutral-400 hover:text-neutral-600',
            )}
          >
            General
          </button>
        </div>

        {/* hint */}
        <div className="px-4 py-1 text-[10px] text-neutral-300 text-right shrink-0">
          press tab to switch
        </div>

        {/* bindings list */}
        <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-2">
          {currentBindings.length > 0 ? (
            currentBindings.map(binding => (
              <div
                key={binding.keys}
                className="flex items-center justify-between px-3 py-1.5"
              >
                <span className="text-sm text-neutral-600">{binding.label}</span>
                <kbd className="text-xs font-mono text-neutral-400 bg-neutral-100 px-1.5 py-0.5 rounded">
                  {binding.keys}
                </kbd>
              </div>
            ))
          ) : (
            <div className="text-sm text-neutral-400 italic text-center py-8">
              no keybindings
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
