// src/components/ui/FuzzyPicker/FuzzyPicker.tsx

import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { cn } from '@bklearn/shadcn'

export interface FuzzyPickerItem {
  id: string
  label: string
  detail?: string
}

interface FuzzyPickerProps {
  items: FuzzyPickerItem[]
  placeholder?: string
  onSelect: (item: FuzzyPickerItem) => void
  onClose: () => void
}

function fuzzyMatch(query: string, text: string): boolean {
  const lower = text.toLowerCase()
  const q = query.toLowerCase()
  let qi = 0
  for (let i = 0; i < lower.length && qi < q.length; i++) {
    if (lower[i] === q[qi]) qi++
  }
  return qi === q.length
}

export function FuzzyPicker({ items, placeholder = 'search...', onSelect, onClose }: FuzzyPickerProps) {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const filtered = useMemo(() => {
    if (!query) return items
    return items.filter(item => fuzzyMatch(query, item.label))
  }, [items, query])

  useEffect(() => {
    setSelectedIndex(0)
  }, [filtered.length])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex(i => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const item = filtered[selectedIndex]
      if (item) onSelect(item)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    } else if (/^[1-9]$/.test(e.key) && !query) {
      // number shortcut when query is empty
      const idx = parseInt(e.key) - 1
      if (idx < filtered.length) {
        e.preventDefault()
        onSelect(filtered[idx])
      }
    }
  }, [filtered, selectedIndex, onSelect, onClose, query])

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh] bg-black/30">
      <div className="w-full max-w-md bg-white rounded-lg shadow-xl overflow-hidden">
        <input
          ref={inputRef}
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="w-full px-4 py-3 text-sm border-b border-neutral-100 focus:outline-none"
        />
        <div className="max-h-[300px] overflow-y-auto">
          {filtered.map((item, i) => (
            <button
              key={item.id}
              onClick={() => onSelect(item)}
              className={cn(
                'w-full text-left px-4 py-2 text-sm flex items-center justify-between transition-colors',
                i === selectedIndex
                  ? 'bg-neutral-100 text-neutral-900'
                  : 'text-neutral-600 hover:bg-neutral-50',
              )}
            >
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-neutral-300 font-mono w-3">
                  {i < 9 ? i + 1 : ''}
                </span>
                <span className="font-mono truncate">{item.label}</span>
              </div>
              {item.detail && (
                <span className="text-xs text-neutral-400 ml-2 shrink-0">{item.detail}</span>
              )}
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="px-4 py-6 text-sm text-neutral-400 text-center italic">
              no results
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
