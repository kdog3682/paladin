import { useEffect } from 'react'
import { cn } from '@bklearn/shadcn'
import { useAppStore } from './store'

export function Cmdline() {
  const mode = useAppStore((s) => s.mode)
  const docProject = useAppStore((s) => s.docProject)
  const docTitle = useAppStore((s) => s.docTitle)
  const cmdBuffer = useAppStore((s) => s.cmdBuffer)
  const cmdArg = useAppStore((s) => s.cmdArg)
  const cmdSuggestions = useAppStore((s) => s.cmdSuggestions)
  const cmdError = useAppStore((s) => s.cmdError)
  const resetCmdline = useAppStore((s) => s.resetCmdline)

  useEffect(() => {
    if (!cmdError) return
    const t = setTimeout(() => resetCmdline(), 2500)
    return () => clearTimeout(t)
  }, [cmdError, resetCmdline])

  const writing = mode === 'cmdline' // past abbr + space: cmdBuffer is the expanded "name " prefix

  return (
    <div className="relative flex h-7 items-center gap-2 border-t bg-muted/40 px-3 font-mono text-sm">
      {/* input */}
      <div className="flex min-w-0 flex-1 items-center gap-1">
        {cmdError ? (
          <span className="text-destructive">{cmdError}</span>
        ) : (
          <>
            {/* expanded command name is colored like a fish autosuggestion once it resolves */}
            <span className={writing ? 'text-blue-500' : undefined}>{cmdBuffer}</span>
            {writing && <span>{cmdArg}</span>}
            <Cursor />
          </>
        )}
      </div>

      <span className="text-muted-foreground">|</span>

      {/* display name */}
      <span className="shrink-0 text-muted-foreground">
        @{docProject}/{docTitle}
      </span>

      {cmdSuggestions.length > 0 && (
        <div className="absolute bottom-7 left-3 flex flex-col rounded-md border bg-popover shadow-md">
          {cmdSuggestions.slice(0, 8).map((s, i) => (
            <div key={s} className={cn('px-2 py-1 text-sm', i === 0 && 'bg-accent text-accent-foreground')}>
              {s}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Cursor() {
  return <span className="h-4 w-[2px] animate-pulse bg-foreground" />
}
