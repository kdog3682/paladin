// @paladin/project-viewer-frontend/src/components/GrepModal.tsx
//
// Modal opened with '/'. Type a pattern, press Enter to add as
// a grep inclusion filter. Active greps shown above the input
// with hover previews and trash-to-remove. Ineffective greps are red.

import { useState, useRef, useEffect } from "react"
import { Input } from "@bklearn/shadcn"
import { useStore } from "../lib/store"
import { cn } from "../lib/cn"

export function GrepModal() {
  const [value, setValue] = useState("")
  const [loading, setLoading] = useState(false)
  const greps = useStore(s => s.greps)
  const addGrep = useStore(s => s.addGrep)
  const removeGrep = useStore(s => s.removeGrep)
  const setGrepOpen = useStore(s => s.setGrepOpen)
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    ref.current?.focus()
  }, [])

  const submit = async () => {
    const pattern = value.trim()
    if (!pattern) return
    setLoading(true)
    await addGrep(pattern)
    setLoading(false)
    setValue("")
  }

  const onKey = (e: React.KeyboardEvent) => {
    e.stopPropagation()
    if (e.key === "Enter") submit()
    if (e.key === "Escape") setGrepOpen(false)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-32 bg-black/50"
      onClick={() => setGrepOpen(false)}
    >
      <div
        className="w-full max-w-md rounded-lg border border-border bg-popover shadow-lg p-4 space-y-3"
        onClick={e => e.stopPropagation()}
      >
        {/* active grep filters */}
        {greps.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {greps.map(g => (
              <div
                key={g.pattern}
                className={cn(
                  "group flex items-center gap-1.5 rounded-full px-3 py-1 text-xs border",
                  g.effective
                    ? "border-border bg-muted"
                    : "border-destructive bg-destructive/10 text-destructive",
                )}
                title={
                  g.effective
                    ? `${g.matches.length} files: ${g.matches.slice(0, 5).join(", ")}${g.matches.length > 5 ? "…" : ""}`
                    : "No matches"
                }
              >
                <code>{g.pattern}</code>
                <button
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                  onClick={() => removeGrep(g.pattern)}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        {/* input */}
        <Input
          ref={ref}
          placeholder="grep pattern…"
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={onKey}
          disabled={loading}
          className="font-mono text-sm"
        />

        {loading && (
          <p className="text-xs text-muted-foreground animate-pulse">
            Searching…
          </p>
        )}

        <p className="text-xs text-muted-foreground">
          Enter to add · Esc to close
        </p>
      </div>
    </div>
  )
}
