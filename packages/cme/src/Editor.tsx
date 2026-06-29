// @paladin/cme/Editor.tsx
import { useRef, useEffect, useCallback } from 'react'
import { EditorView } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { createExtensions } from './extensions'

const STORAGE_KEY = 'codemirror-editor-content'
const CURSOR_KEY = 'codemirror-editor-cursor'

export function Editor() {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)

  const saveToStorage = useCallback((view: EditorView) => {
    localStorage.setItem(STORAGE_KEY, view.state.doc.toString())
    localStorage.setItem(CURSOR_KEY, String(view.state.selection.main.head))
    return true
  }, [])

  useEffect(() => {
    const save = () => {
      if (viewRef.current) saveToStorage(viewRef.current)
    }
    window.addEventListener('blur', save)
    document.addEventListener('visibilitychange', save)
    return () => {
      window.removeEventListener('blur', save)
      document.removeEventListener('visibilitychange', save)
    }
  }, [saveToStorage])

  useEffect(() => {
    if (!containerRef.current) return

    const saved = localStorage.getItem(STORAGE_KEY) ?? ''
    const savedCursor = parseInt(localStorage.getItem(CURSOR_KEY) ?? '0', 10)
    const cursor = Math.min(savedCursor, saved.length)

    const view = new EditorView({
      state: EditorState.create({
        doc: saved,
        extensions: createExtensions(saveToStorage),
        selection: { anchor: cursor },
      }),
      parent: containerRef.current,
    })
    viewRef.current = view
    view.focus()
    view.dispatch({ effects: EditorView.scrollIntoView(cursor, { y: 'center' }) })

    return () => {
      view.destroy()
      viewRef.current = null
    }
  }, [saveToStorage])

  return (
    <div className="w-screen h-screen">
      <div ref={containerRef} className="w-full h-full" />
    </div>
  )
}
