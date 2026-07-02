import { RefObject, useEffect, useRef, useState } from 'react'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { createExtensions, foldsFacet } from '../extension'

interface UseEditorOptions {
  onNew?: (view: EditorView) => void
  onOpen?: (view: EditorView) => void
  onSave?: (docJson: unknown, foldsJson: unknown) => void
}

interface UseEditorResult {
  containerRef: RefObject<HTMLDivElement>
  view: EditorView | null
}

export function useEditor({ onNew, onOpen, onSave }: UseEditorOptions): UseEditorResult {
  const containerRef = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<EditorView | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const save = (v: EditorView) => {
      onSave?.(v.state.doc.toJSON(), v.state.facet(foldsFacet))
    }

    const appKeymap = keymap.of([
      { key: 'Mod-n', run: (v) => { onNew?.(v); return true } },
      { key: 'Mod-o', run: (v) => { onOpen?.(v); return true } },
      { key: 'Mod-s', run: (v) => { save(v); return true } },
    ])

    const state = EditorState.create({
      extensions: [...createExtensions(), appKeymap],
    })

    const editorView = new EditorView({ state, parent: containerRef.current })
    setView(editorView)

    const handleBlur = () => save(editorView)
    const handleVisibility = () => { if (document.hidden) save(editorView) }

    window.addEventListener('blur', handleBlur)
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      window.removeEventListener('blur', handleBlur)
      document.removeEventListener('visibilitychange', handleVisibility)
      editorView.destroy()
    }
  }, [])

  return { containerRef, view }
}
