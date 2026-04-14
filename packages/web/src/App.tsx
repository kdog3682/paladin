// src/App.tsx

import { useEffect } from 'react'
import { AppShell } from '@/components/AppShell/AppShell'
import { useAppletStore } from '@/stores/appletStore'
import { FileViewer } from '@/components/FileViewer/FileViewer'

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
  { id: 'file-viewer', label: 'Files', shortcut: '1', component: FileViewer },
  { id: 'tickets', label: 'Tickets', shortcut: '2', component: Tickets },
  { id: 'terminal', label: 'Terminal', shortcut: '3', component: Terminal },
  { id: 'notes', label: 'Notes', shortcut: '4', component: Notes },
  { id: 'settings', label: 'Settings', shortcut: '5', component: Settings },
]

export default function App() {
  const register = useAppletStore(s => s.register)

  useEffect(() => {
    register(APPLETS)
  }, [register])

  return <AppShell />
}
