// @paladin/web/src/components/AppRunner/index.ts
import { useEffect } from 'react'
import { useRegisterBindings } from '../../providers/KeyBindingProvider'
import { useCommandRegistry } from '../../stores/commandRegistry'

export function AppRunner() {
  const { register, unregister } = useCommandRegistry()

  useEffect(() => {
    register([
      {
        id: 'app:pick',
        label: 'Pick items',
        scope: 'AppRunner',
        args: [
          {
            name: 'item',
            type: 'autocomplete',
            resolve: (partial) =>
              ['dev-server', 'test-runner', 'build', 'lint', 'typecheck']
                .filter((i) => i.toLowerCase().includes(partial.toLowerCase())),
          },
          {
            name: 'mode',
            type: 'autocomplete',
            resolve: () => ['watch', 'once', 'debug'],
          },
        ],
        execute: (args) => console.log('[app] pick', args.item, args.mode),
      },
    ])
    return () => unregister(['app:pick'])
  }, [register, unregister])

  useRegisterBindings('app-runner', 'AppRunner', [
    { key: 'r', description: 'Run app', handler: () => console.log('[app] run'), scope: 'AppRunner' },
    { key: 'x', description: 'Stop app', handler: () => console.log('[app] stop'), scope: 'AppRunner' },
  ])

  return (
    <div className="flex items-center justify-center h-full">
      <p className="text-zinc-500 font-mono text-sm">AppRunner — press <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 text-xs">r</kbd> run / <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 text-xs">x</kbd> stop</p>
    </div>
  )
}
