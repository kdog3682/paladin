// src/App.tsx

import { useEffect } from 'react'
import { AppShell } from '@/components/AppShell/AppShell'
import { useAppletStore } from '@/stores/appletStore'
import { FileViewer } from '@/components/FileViewer/FileViewer'
import { SessionMonitor } from '@/components/SessionMonitor'

// placeholder applets
function Placeholder({ name }: { name: string }) {
  return (
    <div className="flex items-center justify-center h-full text-neutral-400 text-sm">
      {name}
    </div>
  )
}

const Tickets = () => <Placeholder name="Tickets" />
const Terminal = () => <Placeholder name="Terminal" />
const Settings = () => <Placeholder name="Settings" />
const Notes = () => <Placeholder name="Notes" />

const APPLETS = [
  { id: 'monitor', label: 'Monitor', component: SessionMonitor },
  { id: 'file-viewer', label: 'Files', component: FileViewer },
  // { id: 'tickets', label: 'Tickets', component: Tickets },
  // { id: 'terminal', label: 'Terminal', component: Terminal },
  // { id: 'notes', label: 'Notes', component: Notes },
  // injection-point
  { id: 'settings', label: 'Settings', component: Settings },
]

export default function App() {
  const register = useAppletStore(s => s.register)

  useEffect(() => {
    register(APPLETS)
  }, [register])

  return <AppShell />
}
