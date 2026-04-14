// src/components/AppShell/AppShell.tsx

import { useEffect, useMemo } from 'react'
import { useKeybindingStore, useKeybindingListener, useRegisterLayer, LAYER_PRIORITY } from '@/lib/keybindings'
import { useAppletStore } from '@/stores/appletStore'
import { AppletSwitcher } from './AppletSwitcher'

export function AppShell() {
  const applets = useAppletStore(s => s.applets)
  const activeId = useAppletStore(s => s.activeId)
  const setActive = useAppletStore(s => s.setActive)
  const setActiveApplet = useKeybindingStore(s => s.setActiveApplet)

  // sync applet store → keybind store
  useEffect(() => {
    setActiveApplet(activeId)
  }, [activeId, setActiveApplet])

  // register shell-level keybinds (applet switching via 1-5)
  const shellBindings = useMemo(() =>
    applets.map(applet => ({
      keys: applet.shortcut,
      label: `Switch to ${applet.label}`,
      action: () => setActive(applet.id),
    })),
    [applets, setActive],
  )

  useRegisterLayer('shell', 'shell', shellBindings, LAYER_PRIORITY.SHELL)
  useKeybindingListener()

  const ActiveComponent = useMemo(() => {
    const applet = applets.find(a => a.id === activeId)
    return applet?.component ?? null
  }, [applets, activeId])

  return (
    <div className="flex flex-col h-screen bg-neutral-50 text-neutral-900">
      <AppletSwitcher />
      <main className="flex-1 min-h-0">
        {ActiveComponent && <ActiveComponent />}
      </main>
    </div>
  )
}
