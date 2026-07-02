import { useEffect, useMemo, useRef } from 'react'
import { basicSetup } from 'codemirror'
import { EditorView, keymap } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { foldGutter } from '@codemirror/language'
import { useAppStore } from './store'
import { editorKeymap, installGlobalKeymap, handleNormalKey, type AppContext } from './commands'
import { defaultGlobalBindings } from './globalBindings'
import { apiClient } from './apiClient'
import { flushSave, scheduleSave, restoreEditorState } from './persistence'
import { Cmdline } from './Cmdline'

export default function App() {
  const editorRef = useRef<HTMLDivElement>(null)

  const ctx: AppContext = useMemo(
    () => ({
      api: apiClient,
      store: useAppStore,
      doc: () => {
        const s = useAppStore.getState()
        return { id: s.docId, project: s.docProject, title: s.docTitle }
      },
    }),
    []
  )

  // mount CM6, load the current doc (restoring folds/selection if present), wire autosave
  useEffect(() => {
    if (!editorRef.current) return
    let view: EditorView | undefined
    let cancelled = false

    ;(async () => {
      const docId = ctx.doc().id || (await ctx.api.call('doc.currentOrCreate'))
      const doc = await ctx.api.call('doc.open', [docId])
      if (cancelled) return
      ctx.store.getState().setDocMeta({ docId: doc.id, docProject: doc.project, docTitle: doc.title })

      const extensions = [
        basicSetup,
        foldGutter(),
        keymap.of(editorKeymap(ctx)),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) scheduleSave(ctx, update.view)
        }),
      ]

      const state = doc.editorState
        ? restoreEditorState(doc.editorState, extensions)
        : EditorState.create({ doc: doc.content ?? '', extensions })

      view = new EditorView({ state, parent: editorRef.current! })
      ctx.store.getState().setView(view)
    })()

    return () => {
      cancelled = true
      view?.destroy()
      ctx.store.getState().setView(null)
    }
  }, [ctx])

  // Ctrl/Cmd shortcuts — work regardless of focus/mode
  useEffect(() => installGlobalKeymap(ctx, defaultGlobalBindings), [ctx])

  // normal-mode / cmdline typing, only relevant when the editor isn't focused
  useEffect(() => {
    const handler = (evt: KeyboardEvent) => handleNormalKey(evt, ctx)
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [ctx])

  // flush pending edits on blur and before the tab closes/refreshes
  useEffect(() => {
    const flush = () => {
      const view = ctx.store.getState().view
      if (view) flushSave(ctx, view)
    }
    window.addEventListener('blur', flush)
    window.addEventListener('beforeunload', flush)
    return () => {
      window.removeEventListener('blur', flush)
      window.removeEventListener('beforeunload', flush)
    }
  }, [ctx])

  return (
    <div className="flex h-screen flex-col">
      <div ref={editorRef} className="min-h-0 flex-1 overflow-auto" />
      <Cmdline />
    </div>
  )
}
