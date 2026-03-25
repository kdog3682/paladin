// @paladin/json-viewer-frontend/src/components/FzfPicker.tsx

import { useState, useEffect, useRef, useMemo } from "react"
import { useStore } from "../store"
import { Input } from "@bklearn/shadcn"

export function FzfPicker() {
  const { files, fzfOpen, closeFzf, selectFile } = useStore()
  const t = useStore((s) => s.theme)
  const [query, setQuery] = useState("")
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const filtered = useMemo(() => {
    if (!query) return files
    const lower = query.toLowerCase()
    return files.filter((f) => f.name.toLowerCase().includes(lower))
  }, [files, query])

  useEffect(() => {
    if (fzfOpen) {
      setQuery("")
      setActiveIndex(Math.max(0, filtered.length - 1))
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [fzfOpen])

  useEffect(() => {
    setActiveIndex(Math.max(0, filtered.length - 1))
  }, [filtered])

  useEffect(() => {
    const list = listRef.current
    if (!list) return
    const active = list.children[activeIndex] as HTMLElement
    active?.scrollIntoView({ block: "nearest" })
  }, [activeIndex])

  if (!fzfOpen) return null

  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case "ArrowUp":
        e.preventDefault()
        setActiveIndex((i) => Math.max(0, i - 1))
        break
      case "ArrowDown":
        e.preventDefault()
        setActiveIndex((i) => Math.min(filtered.length - 1, i + 1))
        break
      case "Enter":
        e.preventDefault()
        if (filtered[activeIndex]) {
          selectFile(filtered[activeIndex])
        }
        break
      case "Escape":
        e.preventDefault()
        closeFzf()
        break
    }
  }

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center ${t.fzfOverlay} backdrop-blur-sm`}
      onMouseDown={(e) => {
        // close on backdrop click
        if (e.target === e.currentTarget) closeFzf()
      }}
    >
      <div
        className={`flex w-full max-w-xl flex-col rounded-lg border ${t.fzfBorder} ${t.fzfBg} shadow-2xl overflow-hidden`}
        onKeyDown={handleKeyDown}
      >
        <div
          ref={listRef}
          className="max-h-80 overflow-y-auto flex flex-col p-1"
        >
          {filtered.length === 0 && (
            <div className={`px-3 py-6 text-center ${t.fzfMuted} text-sm`}>
              No matching files
            </div>
          )}
          {filtered.map((file, i) => (
            <button
              key={file.path}
              onClick={() => selectFile(file)}
              className={`flex items-center justify-between rounded px-3 py-1.5 text-left text-sm cursor-pointer transition-colors ${
                i === activeIndex
                  ? `${t.fzfActiveItem} ${t.fzfActiveText}`
                  : `${t.fzfText} hover:opacity-80`
              }`}
            >
              <span className="truncate font-mono">{file.name}</span>
              <span className={`ml-3 shrink-0 text-xs ${t.fzfMuted}`}>
                {new Date(file.mtime).toLocaleDateString()}
              </span>
            </button>
          ))}
        </div>

        <div className={`border-t ${t.fzfBorder} p-2`}>
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search JSON files…"
            className={`${t.fzfInputBg} ${t.fzfInputBorder} ${t.fzfText}`}
          />
        </div>
      </div>
    </div>
  )
}
