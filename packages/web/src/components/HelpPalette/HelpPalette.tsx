// src/components/HelpPalette/HelpPalette.tsx

import { useKeybindingStore } from '@/lib/keybindings'
import { useOverlayKeybindings } from '@/lib/keybindings'
import { useMemo } from 'react'
import { X } from 'lucide-react'

interface HelpPaletteProps {
  onClose: () => void
}

export function HelpPalette({ onClose }: HelpPaletteProps) {
  const getActiveBindings = useKeybindingStore(s => s.getActiveBindings)
  const bindings = getActiveBindings()

  const overlayBindings = useMemo(() => [
    { keys: 'esc', label: 'Close help', action: onClose, allowInInput: true },
    { keys: 'ctrl+/', label: 'Close help', action: onClose, allowInInput: true },
  ], [onClose])

  useOverlayKeybindings('help-palette', overlayBindings)

  // group by layer type heuristic: keys with ctrl/shift = global-ish, single char = shell
  const grouped = useMemo(() => {
    const groups: { label: string, items: typeof bindings }[] = [
      { label: 'Keybindings', items: bindings.filter(b => b.label !== 'Close help') },
    ]
    return groups
  }, [bindings])

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-black/30">
      <div className="w-full max-w-sm bg-white rounded-lg shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-100">
          <span className="text-sm font-medium text-neutral-800">Keyboard shortcuts</span>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700 transition-colors">
            <X size={16} />
          </button>
        </div>
        <div className="max-h-[400px] overflow-y-auto p-2">
          {grouped.map(group => (
            <div key={group.label}>
              {group.items.map(binding => (
                <div
                  key={binding.keys}
                  className="flex items-center justify-between px-3 py-1.5 rounded"
                >
                  <span className="text-sm text-neutral-600">{binding.label}</span>
                  <kbd className="text-xs font-mono text-neutral-400 bg-neutral-100 px-1.5 py-0.5 rounded">
                    {binding.keys}
                  </kbd>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
