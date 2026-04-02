// @paladin/web/src/components/SessionMonitor/index.ts
import { useEffect } from 'react'
import { useRegisterBindings } from '../../providers/KeyBindingProvider'
import { useCommandRegistry } from '../../stores/commandRegistry'

export function SessionMonitor() {
  const { register, unregister } = useCommandRegistry()

  useEffect(() => {
    register([
      {
        id: 'session:refresh',
        label: 'Refresh sessions',
        scope: 'SessionMonitor',
        args: [],
        execute: () => console.log('[session] refresh'),
      },
    ])
    return () => unregister(['session:refresh'])
  }, [register, unregister])

  useRegisterBindings('session-monitor', 'SessionMonitor', [
    { key: 'r', description: 'Refresh sessions', handler: () => console.log('[session] refresh'), scope: 'SessionMonitor' },
  ])

  return (
    <div className="flex items-center justify-center h-full">
      <p className="text-zinc-500 font-mono text-sm">SessionMonitor — press <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 text-xs">r</kbd> to refresh</p>
    </div>
  )
}
