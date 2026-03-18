// @paladin/project-viewer-frontend/src/components/FilterConfig.tsx
//
// Filter management tab. Shows:
// - warning if >100 files
// - category toggles with counts
// - active grep filters
// - preset save/load

import { useState } from "react"
import { Button, Input } from "@bklearn/shadcn"
import { useStore } from "../lib/store"
import { cn } from "../lib/cn"
import type { FileCategory } from "../types"

const CATEGORIES: { key: FileCategory, label: string, desc: string }[] = [
  { key: "ignored", label: "Ignored", desc: "LICENSE, locks, images, config noise" },
  { key: "manifest", label: "Manifest", desc: "package.json, tsconfig, vite.config, etc" },
  { key: "test", label: "Tests", desc: "*.test.*, *.spec.*, __tests__/" },
  { key: "config", label: "Config", desc: "dotfiles, *.config.ts/js" },
  { key: "source", label: "Source", desc: "everything else" },
]

export function FilterConfig() {
  const repo = useStore(s => s.repo)
  const visible = useStore(s => s.visible)
  const excluded = useStore(s => s.excluded)
  const greps = useStore(s => s.greps)
  const presets = useStore(s => s.presets)
  const toggleExclude = useStore(s => s.toggleExclude)
  const removeGrep = useStore(s => s.removeGrep)
  const savePreset = useStore(s => s.savePreset)
  const applyPreset = useStore(s => s.applyPreset)
  const fetchPresets = useStore(s => s.fetchPresets)

  const [presetName, setPresetName] = useState("")

  if (!repo) return null

  const total = repo.flat.length
  const showing = visible.length

  return (
    <div className="p-4 space-y-6 text-sm">
      {/* file count warning */}
      {showing > 100 && (
        <div className="rounded-md border border-destructive bg-destructive/10 px-4 py-3 text-destructive">
          Too many files ({showing}). Please filter.
        </div>
      )}

      <div className="text-muted-foreground">
        Showing {showing} of {total} files
      </div>

      {/* category toggles */}
      <div className="space-y-2">
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Categories
        </h3>
        {CATEGORIES.map(cat => {
          const count = repo.categories[cat.key] || 0
          const isExcluded = excluded.has(cat.key)

          return (
            <label
              key={cat.key}
              className="flex items-center gap-3 cursor-pointer py-1"
            >
              <input
                type="checkbox"
                checked={!isExcluded}
                onChange={() => toggleExclude(cat.key)}
                className="accent-primary"
              />
              <div className="flex-1">
                <span className="font-medium">{cat.label}</span>
                <span className="ml-2 text-muted-foreground">({count})</span>
                <p className="text-xs text-muted-foreground">{cat.desc}</p>
              </div>
            </label>
          )
        })}
      </div>

      {/* grep filters */}
      {greps.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Grep Filters
          </h3>
          {greps.map(g => (
            <div
              key={g.pattern}
              className={cn(
                "flex items-center justify-between rounded-md border px-3 py-2",
                g.effective
                  ? "border-border"
                  : "border-destructive text-destructive",
              )}
              title={
                g.effective
                  ? `${g.matches.length} matches`
                  : "No matches — ineffective"
              }
            >
              <code className="text-xs">{g.pattern}</code>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {g.matches.length}
                </span>
                <button
                  className="text-muted-foreground hover:text-destructive transition-colors"
                  onClick={() => removeGrep(g.pattern)}
                  title="Remove"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* presets */}
      <div className="space-y-2">
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Presets
        </h3>
        <div className="flex gap-2">
          <Input
            placeholder="Preset name"
            value={presetName}
            onChange={e => setPresetName(e.target.value)}
            className="flex-1 text-xs"
            onKeyDown={e => {
              if (e.key === "Enter" && presetName.trim()) {
                savePreset(presetName.trim())
                setPresetName("")
              }
            }}
          />
          <Button
            variant="outline"
            size="sm"
            disabled={!presetName.trim()}
            onClick={() => {
              savePreset(presetName.trim())
              setPresetName("")
            }}
          >
            Save
          </Button>
        </div>

        {presets.map(p => (
          <button
            key={p.id}
            className="block w-full text-left rounded-md border border-border px-3 py-2 text-xs hover:bg-accent transition-colors"
            onClick={() => applyPreset(p)}
          >
            {p.name}
            <span className="ml-2 text-muted-foreground">
              ({p.excluded.length} excluded, {p.greps.length} greps)
            </span>
          </button>
        ))}

        {presets.length === 0 && (
          <p className="text-xs text-muted-foreground">No saved presets</p>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Press <kbd className="px-1 py-0.5 rounded bg-muted font-mono">/</kbd> to add a grep filter
      </p>
    </div>
  )
}
