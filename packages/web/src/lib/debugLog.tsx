// src/lib/debugLog.tsx

import { create } from 'zustand'

interface DebugMessage {
  id: number
  text: string
  ts: number
}

interface DebugLogState {
  messages: DebugMessage[]
  add: (text: string) => void
  remove: (id: number) => void
}

let nextId = 0

export const useDebugLogStore = create<DebugLogState>((set) => ({
  messages: [],
  add(text) {
    const id = nextId++
    set(s => ({ messages: [...s.messages, { id, text, ts: Date.now() }] }))
    setTimeout(() => {
      set(s => ({ messages: s.messages.filter(m => m.id !== id) }))
    }, 3000)
  },
  remove(id) {
    set(s => ({ messages: s.messages.filter(m => m.id !== id) }))
  },
}))

export function debugLog(...args: unknown[]) {
  const text = args
    .map(a => typeof a === 'object' ? JSON.stringify(a, null, 0) : String(a))
    .join(' ')
  useDebugLogStore.getState().add(text)
}

export function DebugToasts() {
  const messages = useDebugLogStore(s => s.messages)

  if (messages.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-1.5 max-w-sm pointer-events-none">
      {messages.map(m => (
        <div
          key={m.id}
          className="px-3 py-1.5 bg-neutral-900 text-neutral-100 text-xs font-mono rounded shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-150"
        >
          {m.text}
        </div>
      ))}
    </div>
  )
}
