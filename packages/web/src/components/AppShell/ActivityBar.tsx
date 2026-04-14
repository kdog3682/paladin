// src/components/AppShell/ActivityBar.tsx

import {
  Files,
  Ticket,
  Terminal,
  StickyNote,
  Settings,
  User,
} from 'lucide-react'
import { useAppletStore } from '@/stores/appletStore'
import { IconButton } from '@/components/ui/IconButton'
import { Separator } from '@bklearn/shadcn'

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

  const mainApplets = applets.filter(a => a.id !== 'settings')
  const settingsApplet = applets.find(a => a.id === 'settings')

  return (
    <div className="flex flex-col items-center justify-between py-3 w-12 border-l border-neutral-200/60">
      {/* top: user */}
      <div>
        <IconButton
          icon={<User size={18} />}
          label="Profile"
          side="left"
        />
      </div>

      {/* middle: applets with dividers */}
      <div className="flex flex-col items-center gap-0.5">
        {mainApplets.map((applet, i) => (
          <div key={applet.id} className="flex flex-col items-center">
            {i > 0 && (
              <Separator className="w-5 my-0.5 bg-neutral-200/60" />
            )}
            <IconButton
              icon={APPLET_ICONS[applet.id] ?? <Files size={18} />}
              label={`${applet.label} (${applet.shortcut})`}
              onClick={() => setActive(applet.id)}
              active={activeId === applet.id}
              side="left"
            />
          </div>
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
            side="left"
          />
        )}
      </div>
    </div>
  )
}
