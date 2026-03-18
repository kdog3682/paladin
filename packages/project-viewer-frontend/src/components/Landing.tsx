// @paladin/project-viewer-frontend/src/components/Landing.tsx
//
// Shown when status is "idle" or "loading".
// Single input — accepts "org/repo" or a full github url.

import { useState, type KeyboardEvent } from "react"
import { Input } from "@bklearn/shadcn"
import { useStore } from "../lib/store"

export function Landing() {
  const [value, setValue] = useState("")
  const status = useStore(s => s.status)
  const error = useStore(s => s.error)
  const load = useStore(s => s.load)

  const submit = () => {
    const trimmed = value.trim()
    if (!trimmed) return
    load(trimmed)
  }

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Enter") submit()
  }

  return (
    <div className="flex items-center justify-center h-screen bg-background">
      <div className="flex flex-col items-center gap-4 w-full max-w-lg px-4">
        <h1 className="text-2xl font-semibold text-foreground">
          Project Viewer
        </h1>
        <p className="text-sm text-muted-foreground">
          Enter org/repo or a GitHub URL
        </p>

        <Input
          autoFocus
          placeholder="anomalyco/opencode"
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={onKey}
          disabled={status === "loading"}
          className="w-full"
        />

        {status === "loading" && (
          <p className="text-sm text-muted-foreground animate-pulse">
            Cloning repository…
          </p>
        )}

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}
      </div>
    </div>
  )
}
