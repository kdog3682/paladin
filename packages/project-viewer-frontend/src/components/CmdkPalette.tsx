// @paladin/project-viewer-frontend/src/components/CmdkPalette.tsx
//
// Command palette opened with Cmd+K. Shows:
// - text input that doubles as new session name creator
// - list of all sessions for the current repo
// - clicking a session loads it, typing + enter creates a new one
// Sessions default to timestamps but can be named here.

import { useState, useRef, useEffect } from "react"
import { Input } from "@bklearn/shadcn"
import { useStore } from "../lib/store"
import { cn } from "../lib/cn"

export function CmdkPalette() {
  const [query, setQuery] = useState("")
  const [idx, setIdx] = useState(0)
  const sessions = useStore(s => s.sessions)
  const setCmdkOpen = useStore(s => s.setCmdkOpen)
  const loadSession = useStore(s => s.loadSession)
  const newSession = useStore(s => s.newSession)
  const fetchSessions = useStore(s => s.fetchSessions)
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetchSessions()
    ref.current?.focus()
  }, [])

  const filtered = sessions.filter(s =>
    s.name.toLowerCase().includes(query.toLowerCase()),
  )

  const select = async (id: string) => {
    await loadSession(id)
    setCmdkOpen(false)
  }

  const create = async () => {
    const name = query.trim() || undefined
    await newSession(name)
    setCmdkOpen(false)
  }

  const onKey = (e: React.KeyboardEvent) => {
    e.stopPropagation()

    switch (e.key) {
      case "Escape":
        setCmdkOpen(false)
        break

      case "ArrowDown":
        e.preventDefault()
        setIdx(Math.min(idx + 1, filtered.length))
        break

      case "ArrowUp":
        e.preventDefault()
        setIdx(Math.max(idx - 1, 0))
        break

      case "Enter":
        e.preventDefault()
        // if cursor is past the list, create new session
        if (idx >= filtered.length || filtered.length === 0) {
          create()
        } else {
          select(filtered[idx].id)
        }
        break
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-32 bg-black/50"
      onClick={() => setCmdkOpen(false)}
    >
      <div
        className="w-full max-w-md rounded-lg border border-border bg-popover shadow-lg overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-3 border-b border-border">
          <Input
            ref={ref}
            placeholder="Search sessions or type a new name…"
            value={query}
            onChange={e => { setQuery(e.target.value); setIdx(0) }}
            onKeyDown={onKey}
            className="text-sm"
          />
        </div>

        <div className="max-h-64 overflow-auto">
          {filtered.map((s, i) => (
            <button
              key={s.id}
              className={cn(
                "w-full text-left px-4 py-2.5 text-sm transition-colors",
                i === idx
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-muted",
              )}
              onClick={() => select(s.id)}
              onMouseEnter={() => setIdx(i)}
            >
              <div className="font-medium">{s.name}</div>
              <div className="text-xs text-muted-foreground">
                {s.bookmarks.length} bookmarks · updated {new Date(s.updated).toLocaleDateString()}
              </div>
            </button>
          ))}

          {/* create new option — always last */}
          <button
            className={cn(
              "w-full text-left px-4 py-2.5 text-sm transition-colors",
              idx >= filtered.length
                ? "bg-accent text-accent-foreground"
                : "hover:bg-muted",
            )}
            onClick={create}
            onMouseEnter={() => setIdx(filtered.length)}
          >
            <span className="text-primary font-medium">
              + New session
            </span>
            {query.trim() && (
              <span className="ml-2 text-muted-foreground">
                "{query.trim()}"
              </span>
            )}
          </button>
        </div>

        <div className="px-4 py-2 border-t border-border text-xs text-muted-foreground">
          ↑↓ navigate · Enter select · Esc close
        </div>
      </div>
    </div>
  )
}
