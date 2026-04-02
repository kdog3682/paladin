// @paladin/web/src/components/FileViewer/index.ts
import { useEffect } from 'react'
import { useRegisterBindings } from '../../providers/KeyBindingProvider'
import { useCommandRegistry } from '../../stores/commandRegistry'

export function FileViewer() {
  const { register, unregister } = useCommandRegistry()

  useEffect(() => {
    register([
      {
        id: 'file:browse',
        label: 'Browse directory',
        scope: 'FileViewer',
        args: [
          {
            name: 'directory',
            type: 'autocomplete',
            resolve: (partial) =>
              ['src', 'src/components', 'src/stores', 'src/providers', 'public', 'dist']
                .filter((d) => d.toLowerCase().includes(partial.toLowerCase())),
          },
        ],
        execute: (args) => console.log('[file] browse', args.directory),
      },
    ])
    return () => unregister(['file:browse'])
  }, [register, unregister])

  useRegisterBindings('file-viewer', 'FileViewer', [
    { key: 'r', description: 'Refresh file list', handler: () => console.log('[file] refresh'), scope: 'FileViewer' },
  ])

  return (
    <div className="flex items-center justify-center h-full">
      <p className="text-zinc-500 font-mono text-sm">FileViewer — press <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 text-xs">r</kbd> to refresh</p>
    </div>
  )
}
