import { useAppStore, type LogEntry } from './store'
import type { AppContext } from './commands/types'

interface OmniPanelProps {
  ctx: AppContext
}

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export function OmniPanel({ ctx }: OmniPanelProps) {
  const omniView = useAppStore((s) => s.omniView)
  const omniItems = useAppStore((s) => s.omniItems)

  return (
    <div className="flex h-full w-80 flex-col overflow-y-auto border-l bg-muted/20 p-2 text-sm">
      <div className="mb-2 px-1 text-xs uppercase text-muted-foreground">{omniView}</div>

      {omniView === 'recent' &&
        (omniItems as { id: string; project: string; title: string }[]).map((doc) => (
          <button
            key={doc.id}
            onClick={() =>
              ctx.store.getState().setDocMeta({ docId: doc.id, docProject: doc.project, docTitle: doc.title })
            }
            className="rounded px-2 py-1 text-left font-mono hover:bg-accent"
          >
            @{doc.project}/{doc.title}
          </button>
        ))}

      {omniView === 'notes' &&
        (omniItems as { id: string; text: string; createdAt: number }[]).map((note) => (
          <div key={note.id} className="rounded px-2 py-1">
            <div className="text-xs text-muted-foreground">{timeAgo(note.createdAt)}</div>
            <div>{note.text}</div>
          </div>
        ))}

      {omniView === 'logs' &&
        (omniItems as LogEntry[]).map((log) => (
          <div key={log.id} className="rounded px-2 py-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{log.type}</span>
              <span>{timeAgo(log.at)}</span>
            </div>
            <pre className="whitespace-pre-wrap break-all text-xs">{JSON.stringify(log.payload)}</pre>
          </div>
        ))}

      {omniView === 'help' &&
        (omniItems as { keys: string; description: string }[]).map((entry) => (
          <div key={entry.keys} className="flex justify-between gap-2 px-2 py-1">
            <span className="text-blue-500">{entry.keys}</span>
            <span className="text-muted-foreground">{entry.description}</span>
          </div>
        ))}
    </div>
  )
}
