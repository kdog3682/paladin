import { useEffect, useMemo, useRef } from 'react'
import { EditorView, keymap } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { useAppStore } from './store'
import { editorKeymap, installGlobalKeymap } from './commands/keymap'
import { handleNormalKey } from './commands/dispatch'
import { defaultGlobalBindings } from './commands/globalBindings'
import type { AppContext } from './commands/types'
import { apiClient } from './apiClient'
import { flushSave, flushToDisk, scheduleSave, restoreEditorState } from './persistence'
import { basicSetup } from './extensions'
import { Cmdline } from './Cmdline'
import { DocContext } from './DocContext'
import { OmniPanel } from './OmniPanel'

export default function App() {
  const editorRef = useRef<HTMLDivElement>(null)

  const mode = useAppStore((s) => s.mode)
  const zenMode = useAppStore((s) => s.zenMode)
  const omniOpen = useAppStore((s) => s.omniOpen)
  const omniPinned = useAppStore((s) => s.omniPinned)
  const setZenMode = useAppStore((s) => s.setZenMode)

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

  // zen mode persists across sessions via system/config
  useEffect(() => {
    ctx.api.call('config.get').then((cfg) => cfg?.zenMode && setZenMode(cfg.zenMode))
  }, [ctx, setZenMode])

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

  useEffect(() => installGlobalKeymap(ctx, defaultGlobalBindings), [ctx])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => void handleNormalKey(e, ctx)
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [ctx])

  // flush pending edits (memory + disk) on blur and before the tab closes/refreshes
  useEffect(() => {
    const flush = () => {
      const view = ctx.store.getState().view
      if (!view) return
      flushSave(ctx, view).then(() => flushToDisk(ctx))
    }
    window.addEventListener('blur', flush)
    window.addEventListener('beforeunload', flush)
    return () => {
      window.removeEventListener('blur', flush)
      window.removeEventListener('beforeunload', flush)
    }
  }, [ctx])

  const showOmni = zenMode !== 'partial' && omniOpen && (mode !== 'insert' || omniPinned)
  const showChrome = !(zenMode === 'full' && mode === 'insert') // ctx row + cmdline row

  return (
    <div className="grid h-screen grid-cols-[1fr_auto] grid-rows-[1fr_auto]">
      <div ref={editorRef} className="min-h-0 min-w-0 overflow-auto p-1" />
      {showOmni ? <OmniPanel ctx={ctx} /> : <div />}
      <div className="col-span-2">{showChrome && <DocContext />}</div>
      <div className="col-span-2">{showChrome && <Cmdline />}</div>
    </div>
  )
}
