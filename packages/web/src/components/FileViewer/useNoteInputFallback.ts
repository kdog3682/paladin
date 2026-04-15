// src/components/FileViewer/useNoteInputFallback.ts

import { useCallback } from 'react'
import { useKeybindingFallback, type KeyFallback } from '@/lib/keybindings'
import { useFileViewerStore } from './store'

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

export function useNoteInputFallback() {
  const fallback: KeyFallback = useCallback((combo, e) => {
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
  }, [])

  useKeybindingFallback(fallback)
}
