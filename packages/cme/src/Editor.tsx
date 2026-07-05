import { useEffect, useRef } from 'react'
import { EditorState, type Extension } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { foldState } from '@codemirror/language'
import { useAppStore, type CmSnapshot } from './store'
import type { AppContext } from './types'

const fields = { foldState }

function saveSnapshot(id: string, view: EditorView) {
  const json = view.state.toJSON(fields) // doc + selection + foldState
  useAppStore.getState().setSnapshot(id, { json, scrollTop: view.scrollDOM.scrollTop })
}

function buildState(base: Extension[], updateListener: Extension, snap?: CmSnapshot) {
  const extensions = [...base, updateListener]
  if (snap?.json) return EditorState.fromJSON(snap.json, { extensions }, fields)
  return EditorState.create({ extensions })
}

export function Editor({ ctx, base }: { ctx: AppContext; base: Extension[] }) {
  const parent = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const lastId = useRef('')

  const activeId = useAppStore((s) => s.activeId)
  const panelFocused = useAppStore((s) => s.panelFocused)

  const listener = useRef<Extension>(
    EditorView.updateListener.of((u) => {
      if (!u.docChanged && !u.selectionSet) return
      const id = useAppStore.getState().activeId
      if (id) saveSnapshot(id, u.view)
    }),
  )

  // mount once
  useEffect(() => {
    const view = new EditorView({ parent: parent.current! })
    viewRef.current = view
    return () => view.destroy()
  }, [])

  // swap document state when the active tab changes
  useEffect(() => {
    const view = viewRef.current
    if (!view || !activeId) return

    if (lastId.current && lastId.current !== activeId) saveSnapshot(lastId.current, view)

    const st = useAppStore.getState()
    const snap = st.snapshots[activeId]
    view.setState(buildState(base, listener.current, snap))
    requestAnimationFrame(() => {
      view.scrollDOM.scrollTop = snap?.scrollTop ?? 0
    })
    lastId.current = activeId

    ctx.store.getState().setDocMeta({
      docId: activeId,
      docTitle: st.tabs.find((t) => t.id === activeId)?.title ?? '',
    })

    if (!st.panelFocused) view.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId])

  // return focus to editor after the panel releases it
  useEffect(() => {
    if (!panelFocused) viewRef.current?.focus()
  }, [panelFocused])

  return <div ref={parent} className="h-full w-full overflow-hidden" />
}
