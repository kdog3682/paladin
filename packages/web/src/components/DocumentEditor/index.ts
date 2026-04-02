// @paladin/web/src/components/DocumentEditor/index.ts
import { useEffect } from 'react'
import { useRegisterBindings } from '../../providers/KeyBindingProvider'
import { useCommandRegistry } from '../../stores/commandRegistry'

export function DocumentEditor() {
  const { register, unregister } = useCommandRegistry()

  useEffect(() => {
    register([
      {
        id: 'doc:create',
        label: 'Create nested document',
        scope: 'DocumentEditor',
        args: [{ name: 'name', type: 'text' }],
        execute: (args) => console.log('[doc] create', args.name),
      },
    ])
    return () => unregister(['doc:create'])
  }, [register, unregister])

  useRegisterBindings('document-editor', 'DocumentEditor', [
    { key: 'n', description: 'New document', handler: () => console.log('[doc] new'), scope: 'DocumentEditor' },
    { key: 's', description: 'Save document', handler: () => console.log('[doc] save'), scope: 'DocumentEditor' },
  ])

  return (
    <div className="flex items-center justify-center h-full">
      <p className="text-zinc-500 font-mono text-sm">DocumentEditor — press <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 text-xs">n</kbd> new / <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 text-xs">s</kbd> save</p>
    </div>
  )
}
