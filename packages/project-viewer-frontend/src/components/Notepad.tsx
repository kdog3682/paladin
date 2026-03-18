// @paladin/project-viewer-frontend/src/components/Notepad.tsx
//
// Freeform text area with debounced autosave to the backend session.
// Focuses automatically when this tab is active (handled by keys.ts).
// Escape blurs the textarea so global keys resume.

import { useRef, useEffect, useCallback } from "react"
import { useStore } from "../lib/store"
import { Button } from "@bklearn/shadcn"

/** Debounce delay for autosave (ms). */
const DEBOUNCE = 1500

export function Notepad() {
  const notes = useStore(s => s.notes)
  const setNotes = useStore(s => s.setNotes)
  const saveSession = useStore(s => s.saveSession)
  const session = useStore(s => s.session)
  const ref = useRef<HTMLTextAreaElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>()

  // auto-focus when mounted (tab switched to notepad)
  useEffect(() => {
    ref.current?.focus()
  }, [])

  const onChange = useCallback((value: string) => {
    setNotes(value)

    // debounced save
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      if (session) saveSession()
    }, DEBOUNCE)
  }, [session])

  /** Escape blurs the textarea so global keybindings resume. */
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault()
      ref.current?.blur()
    }
    // stop all other keys from bubbling to global handler
    e.stopPropagation()
  }

  /** Export the full session as a JSON download. */
  const exportSession = () => {
    const state = useStore.getState()
    const data = {
      session: state.session,
      bookmarks: [...state.bookmarks],
      notes: state.notes,
      excluded: [...state.excluded],
      greps: state.greps.map(g => g.pattern),
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `session-${state.session?.name || "export"}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 flex items-center justify-between px-4 py-2 border-b border-border">
        <span className="text-xs text-muted-foreground">
          {session ? session.name : "No session"}
          {" · "}Esc to unfocus
        </span>
        <Button variant="ghost" size="sm" onClick={exportSession}>
          Export
        </Button>
      </div>
      <textarea
        id="notepad-textarea"
        ref={ref}
        value={notes}
        onChange={e => onChange(e.target.value)}
        onKeyDown={onKey}
        className="flex-1 resize-none bg-transparent p-4 text-sm font-mono leading-relaxed outline-none placeholder:text-muted-foreground"
        placeholder="Jot down notes… (autosaves)"
      />
    </div>
  )
}
