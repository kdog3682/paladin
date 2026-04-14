// src/components/AppShell/ActivityBar.tsx

import {
  Files,
  Ticket,
  Terminal,
  StickyNote,
  Settings,
  User,
} from 'lucide-react'
import { useAppletStore, type AppletDefinition } from '@/stores/appletStore'
import { IconButton } from '@/components/ui/IconButton'

const APPLET_ICONS: Record<string, React.ReactNode> = {
  'file-viewer': <Files size={18} />,
  'tickets': <Ticket size={18} />,
  'terminal': <Terminal size={18} />,
  'notes': <StickyNote size={18} />,
  'settings': <Settings size={18} />,
}

export function ActivityBar() {
  const applets = useAppletStore(s => s.applets)
  const activeId = useAppletStore(s => s.activeId)
  const setActive = useAppletStore(s => s.setActive)

  // settings is handled separately at the bottom
  const mainApplets = applets.filter(a => a.id !== 'settings')
  const settingsApplet = applets.find(a => a.id === 'settings')

  return (
    <div className="flex flex-col items-center justify-between py-3 w-12 bg-neutral-50 border-l border-neutral-200/60">
      {/* top: user */}
      <div>
        <IconButton
          icon={<User size={18} />}
          label="Profile"
          size="md"
        />
      </div>

      {/* middle: applets */}
      <div className="flex flex-col items-center gap-1">
        {mainApplets.map(applet => (
          <IconButton
            key={applet.id}
            icon={APPLET_ICONS[applet.id] ?? <Files size={18} />}
            label={`${applet.label} (${applet.shortcut})`}
            onClick={() => setActive(applet.id)}
            active={activeId === applet.id}
            size="md"
          />
        ))}
      </div>

      {/* bottom: settings */}
      <div>
        {settingsApplet && (
          <IconButton
            icon={<Settings size={18} />}
            label={`${settingsApplet.label} (${settingsApplet.shortcut})`}
            onClick={() => setActive(settingsApplet.id)}
            active={activeId === settingsApplet.id}
            size="md"
          />
        )}
      </div>
    </div>
  )
}
