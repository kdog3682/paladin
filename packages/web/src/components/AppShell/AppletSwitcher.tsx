// src/components/AppShell/AppletSwitcher.tsx

import { useAppletStore } from '@/stores/appletStore'
import { cn } from '@bklearn/shadcn'

export function AppletSwitcher() {
  const applets = useAppletStore(s => s.applets)
  const activeId = useAppletStore(s => s.activeId)
  const setActive = useAppletStore(s => s.setActive)

  return (
    <div className="flex items-center gap-1 px-4 py-2 border-b border-neutral-200/60">
      {applets.map(applet => (
        <button
          key={applet.id}
          onClick={() => setActive(applet.id)}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1 rounded text-sm transition-colors',
            activeId === applet.id
              ? 'bg-neutral-900 text-white'
              : 'text-neutral-500 hover:text-neutral-800 hover:bg-neutral-100',
          )}
        >
          <kbd className="text-[10px] font-mono opacity-50">{applet.shortcut}</kbd>
          <span>{applet.label}</span>
        </button>
      ))}
    </div>
  )
}
