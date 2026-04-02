// @paladin/web/src/components/AppShell/AppShell.tsx
import { useState, useCallback } from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@bklearn/shadcn'
import { useRegisterBindings } from '../../providers/KeyBindingProvider'
import { CommandLineModal } from './CommandLineModal'
import { SessionMonitor } from '../SessionMonitor'
import { FileViewer } from '../FileViewer'
import { DocumentEditor } from '../DocumentEditor'
import { AppRunner } from '../AppRunner'

const tabs = [
  { key: '1', id: 'session-monitor', label: 'SessionMonitor', component: SessionMonitor },
  { key: '2', id: 'file-viewer', label: 'FileViewer', component: FileViewer },
  { key: '3', id: 'document-editor', label: 'DocumentEditor', component: DocumentEditor },
  { key: '4', id: 'app-runner', label: 'AppRunner', component: AppRunner },
] as const

export function AppShell() {
  const [activeTab, setActiveTab] = useState(tabs[0].id)
  const [cmdOpen, setCmdOpen] = useState(false)

  const openCmd = useCallback(() => setCmdOpen(true), [])
  const closeCmd = useCallback(() => setCmdOpen(false), [])

  useRegisterBindings(
    'app-shell-global',
    'global',
    [
      ...tabs.map((t) => ({
        key: t.key,
        description: `Switch to ${t.label}`,
        handler: () => setActiveTab(t.id),
        scope: 'global',
      })),
      {
        key: ';',
        description: 'Open command line',
        handler: openCmd,
        scope: 'global',
      },
    ],
    [openCmd],
  )

  return (
    <div className="flex flex-col h-screen bg-zinc-950 text-zinc-100">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col flex-1 min-h-0">
        <header className="flex items-center border-b border-zinc-800 px-4">
          <TabsList className="bg-transparent h-10 gap-1">
            {tabs.map((t) => (
              <TabsTrigger
                key={t.id}
                value={t.id}
                className="px-3 py-1.5 text-xs font-mono data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-100 text-zinc-500"
              >
                <span className="text-zinc-600 mr-1.5">{t.key}</span>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </header>

        <main className="flex-1 min-h-0 overflow-hidden">
          {tabs.map((t) => (
            <TabsContent key={t.id} value={t.id} className="h-full m-0 outline-none">
              <t.component />
            </TabsContent>
          ))}
        </main>
      </Tabs>

      <CommandLineModal open={cmdOpen} onClose={closeCmd} />
    </div>
  )
}
