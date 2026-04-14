// src/components/AppShell/AppShell.tsx

import { useEffect, useMemo, useState, useCallback } from 'react'
import {
  useKeybindingStore,
  useKeybindingListener,
  useRegisterLayer,
  LAYER_PRIORITY,
} from '@/lib/keybindings'
import { useAppletStore } from '@/stores/appletStore'
import { ActivityBar } from './ActivityBar'
import { HelpPalette } from '@/components/HelpPalette/HelpPalette'

export function AppShell() {
  const applets = useAppletStore(s => s.applets)
  const activeId = useAppletStore(s => s.activeId)
  const setActive = useAppletStore(s => s.setActive)
  const setActiveApplet = useKeybindingStore(s => s.setActiveApplet)
  const [showHelp, setShowHelp] = useState(false)

  useEffect(() => {
    setActiveApplet(activeId)
  }, [activeId, setActiveApplet])

  const toggleHelp = useCallback(() => setShowHelp(s => !s), [])

  const shellBindings = useMemo(() => [
    ...applets.map(applet => ({
      keys: applet.shortcut,
      label: `Switch to ${applet.label}`,
      action: () => setActive(applet.id),
    })),
    {
      keys: 'ctrl+/',
      label: 'Keyboard shortcuts',
      action: toggleHelp,
    },
  ], [applets, setActive, toggleHelp])

  useRegisterLayer('shell', 'shell', shellBindings, LAYER_PRIORITY.SHELL)
  useKeybindingListener()

  const ActiveComponent = useMemo(() => {
    const applet = applets.find(a => a.id === activeId)
    return applet?.component ?? null
  }, [applets, activeId])

  return (
    <>
      <div className="flex h-screen bg-neutral-50 text-neutral-900">
        <main className="flex-1 min-w-0">
          {ActiveComponent && <ActiveComponent />}
        </main>
        <ActivityBar />
      </div>

      {showHelp && <HelpPalette onClose={() => setShowHelp(false)} />}
    </>
  )
}
