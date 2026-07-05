import { useEffect, useRef } from 'react'
import { cn, Input } from '@bklearn/shadcn'
import { useAppStore } from './store'

function RenameField({
  id,
  title,
  onCommit,
  onCancel,
}: {
  id: string
  title: string
  onCommit: (id: string, title: string) => void
  onCancel: () => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])
  return (
    <Input
      ref={ref}
      defaultValue={title}
      className="h-6 px-1 py-0 text-sm"
      onClick={(e) => e.stopPropagation()}
      onBlur={(e) => onCommit(id, e.currentTarget.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          onCommit(id, e.currentTarget.value)
        } else if (e.key === 'Escape') {
          e.preventDefault()
          onCancel()
        }
        e.stopPropagation()
      }}
    />
  )
}

export function TabPanel() {
  const tabs = useAppStore((s) => s.tabs)
  const activeId = useAppStore((s) => s.activeId)
  const panelOpen = useAppStore((s) => s.panelOpen)
  const panelFocused = useAppStore((s) => s.panelFocused)
  const renamingId = useAppStore((s) => s.renamingId)
  const setPanelOpen = useAppStore((s) => s.setPanelOpen)
  const activate = useAppStore((s) => s.activate)
  const closeTab = useAppStore((s) => s.closeTab)
  const startRename = useAppStore((s) => s.startRename)
  const commitRename = useAppStore((s) => s.commitRename)
  const cancelRename = useAppStore((s) => s.cancelRename)

  const open = panelOpen || panelFocused || renamingId != null
  const pinned = panelFocused || renamingId != null

  return (
    <>
      {/* hover trigger strip on the right edge */}
      <div
        className="fixed right-0 top-0 z-10 h-full w-2"
        onMouseEnter={() => setPanelOpen(true)}
      />

      <aside
        onMouseEnter={() => setPanelOpen(true)}
        onMouseLeave={() => !pinned && setPanelOpen(false)}
        className={cn(
          'fixed right-0 top-0 z-20 flex h-full w-64 flex-col border-l bg-background/95 shadow-lg backdrop-blur transition-transform duration-150',
          open ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        <div className="px-3 py-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Tabs
        </div>

        <ul className="flex-1 overflow-y-auto">
          {tabs.map((t) => (
            <li
              key={t.id}
              onClick={() => activate(t.id)}
              onContextMenu={(e) => {
                e.preventDefault()
                startRename(t.id)
              }}
              className={cn(
                'group flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm',
                t.id === activeId ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50',
              )}
            >
              {renamingId === t.id ? (
                <RenameField
                  id={t.id}
                  title={t.title}
                  onCommit={commitRename}
                  onCancel={cancelRename}
                />
              ) : (
                <>
                  <span className="flex-1 truncate">{t.title || 'untitled'}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      closeTab(t.id)
                    }}
                    className="opacity-0 transition-opacity group-hover:opacity-60 hover:opacity-100"
                    aria-label="close tab"
                  >
                    ×
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      </aside>
    </>
  )
}
