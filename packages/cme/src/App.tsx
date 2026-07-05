import { useEffect, useMemo } from 'react'
import { createApiClient } from '@paladin/utils/api'
import { basicSetup } from './extension'
import { globalKeymap } from './commands/globals'
import { useAppStore, type HydratePayload } from './store'
import { Editor } from './Editor'
import { TabPanel } from './TabPanel'
import type { AppContext } from './types'

const apiClient = createApiClient('cme')

export default function App() {
  const ctx: AppContext = useMemo(
    () => ({
      api: apiClient,
      store: useAppStore,
      doc: () => {
        const s = useAppStore.getState()
        return { id: s.docId, title: s.docTitle }
      },
    }),
    [],
  )
  // ctx.store.getState().setDocMeta({ docId: doc.id, docTitle: doc.title })

  const base = useMemo(() => [...basicSetup, globalKeymap(ctx)], [ctx])
  const hydrated = useAppStore((s) => s.hydrated)

  // load persisted state on startup
  useEffect(() => {
    ;(async () => {
      const st = await ctx.api.call<HydratePayload>('state.load')
      useAppStore.getState().hydrate(st)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // periodic + on-hide flush of dirty docs and open-tab state
  useEffect(() => {
    const flush = async () => {
      const s = useAppStore.getState()
      const ids = [...s.dirty]
      for (const id of ids) {
        const tab = s.tabs.find((t) => t.id === id)
        const snap = s.snapshots[id]
        if (!tab || !snap) continue
        const json = snap.json as { doc?: string } | null
        await ctx.api.call('doc.upsert', {
          id,
          title: tab.title,
          content: json?.doc ?? '',
          cm: snap.json,
          scrollTop: snap.scrollTop,
        })
      }
      await ctx.api.call('app.save', {
        tabs: s.tabs.map((t) => t.id),
        activeId: s.activeId,
      })
      if (ids.length) useAppStore.getState().clearDirty(ids)
    }

    const iv = setInterval(flush, 3000)
    const onHide = () => document.visibilityState === 'hidden' && flush()
    document.addEventListener('visibilitychange', onHide)
    return () => {
      clearInterval(iv)
      document.removeEventListener('visibilitychange', onHide)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!hydrated)
    return <div className="grid h-screen place-items-center text-muted-foreground">loading…</div>

  return (
    <div className="relative h-screen w-screen overflow-hidden">
      <Editor ctx={ctx} base={base} />
      <TabPanel />
    </div>
  )
}
