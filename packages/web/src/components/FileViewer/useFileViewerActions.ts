// src/components/FileViewer/useFileViewerActions.ts

import { useMemo, useState, useCallback } from 'react'
import { cn } from '@bklearn/shadcn'
import {
  GitCompare,
  Bookmark,
  Upload,
  MessageSquare,
  Trash2,
  Save,
  Plus,
  FileSearch,
} from 'lucide-react'
import { useAppletKeybindings, type KeyBinding, type KeyFallback } from '@/lib/keybindings'
import { useFileViewerStore } from './store'
import { buildExportPayload, copyToClipboard } from './utils'

// ─── Note input fallback ─────────────────────────────────────────────

const COMMAND_KEYS: Record<string, string> = {
  '{': 'symbolNavUp',
  '}': 'symbolNavDown',
  '[': 'innerNavUp',
  ']': 'innerNavDown',
  '/': 'symbolSearch',
  ';': 'commandLine',
}

function isPrintableCombo(combo: string): boolean {
  return combo.length === 1
}

const noteInputFallback: KeyFallback = (combo, e) => {
  const store = useFileViewerStore.getState()
  const isEmpty = store.noteValue.length === 0

  if (isEmpty && e.key in COMMAND_KEYS) {
    // TODO: dispatch command
    return
  }

  if (combo === 'backspace') {
    store.deleteFromNote()
    return
  }

  if (combo === 'ctrl+backspace') {
    store.deleteWordFromNote()
    return
  }

  if (combo === 'enter') {
    const trimmed = store.noteValue.trim()
    if (trimmed) store.addNote(trimmed)
    return
  }

  if (combo === 'esc' && !isEmpty) {
    store.setNoteValue('')
    return
  }

  if (combo === 'space') {
    store.appendToNote(' ')
    return
  }

  if (isPrintableCombo(combo)) {
    store.appendToNote(e.key)
    return
  }

  return false
}

// ─── Action definitions ──────────────────────────────────────────────

interface ActionDef {
  key: string
  icon: React.ComponentType<{ size?: number }>
  label: string
  onClick: () => void
  active?: boolean
  className?: string
}

export function useFileViewerActions() {
  const currentFile = useFileViewerStore(s => s.currentFile())
  const nextFile = useFileViewerStore(s => s.nextFile)
  const prevFile = useFileViewerStore(s => s.prevFile)
  const toggleDiff = useFileViewerStore(s => s.toggleDiff)
  const toggleMark = useFileViewerStore(s => s.toggleMark)
  const clearNotes = useFileViewerStore(s => s.clearNotes)
  const diffActive = useFileViewerStore(s => s.diffActive)

  const [showNotes, setShowNotes] = useState(false)
  const [exportFlash, setExportFlash] = useState(false)

  const handleExport = useCallback(() => {
    const { files } = useFileViewerStore.getState()
    const payload = buildExportPayload(files.filter(f => f.marked))
    copyToClipboard(payload)
    setExportFlash(true)
    setTimeout(() => setExportFlash(false), 600)
  }, [])

  const handleSave = useCallback(() => {
    console.log('save ticket')
  }, [])

  const handleNew = useCallback(() => {
    console.log('new ticket - open source picker')
  }, [])

  const handleReview = useCallback(() => {
    console.log('open review in text editor applet')
  }, [])

  // keybindings + fallback — all in one registration
  const bindings = useMemo<KeyBinding[]>(() => [
    { keys: 'shift+down', label: 'Next file', action: nextFile },
    { keys: 'shift+up', label: 'Previous file', action: prevFile },
    { keys: 'ctrl+e', label: 'Export', action: handleExport },
    { keys: 'ctrl+s', label: 'Save ticket', action: handleSave },
    { keys: 'ctrl+n', label: 'New ticket', action: handleNew },
    { keys: 'ctrl+o', label: 'Open file', action: () => console.log('open file picker') },
    { keys: 'ctrl+shift+o', label: 'Add from git', action: () => console.log('add from git') },
  ], [nextFile, prevFile, handleExport, handleSave, handleNew])

  useAppletKeybindings('file-viewer', bindings, { fallback: noteInputFallback })

  // action bar
  const actions: ActionDef[] = useMemo(() => [
    { key: 'diff', icon: GitCompare, label: 'Diff', onClick: toggleDiff, active: diffActive },
    { key: 'mark', icon: Bookmark, label: 'Mark', onClick: toggleMark, active: currentFile?.marked },
    { key: 'export', icon: Upload, label: 'Export', onClick: handleExport, active: exportFlash, className: cn(exportFlash && 'animate-pulse') },
    { key: 'notes', icon: MessageSquare, label: 'Notes', onClick: () => setShowNotes(true) },
    { key: 'save', icon: Save, label: 'Save', onClick: handleSave },
    { key: 'clear', icon: Trash2, label: 'Clear notes', onClick: clearNotes },
    { key: 'review', icon: FileSearch, label: 'Review', onClick: handleReview },
    { key: 'new', icon: Plus, label: 'New ticket', onClick: handleNew },
  ], [toggleDiff, diffActive, toggleMark, currentFile?.marked, handleExport, exportFlash, handleSave, clearNotes, handleReview, handleNew])

  return { actions, showNotes, setShowNotes }
}
