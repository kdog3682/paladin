import { useEffect } from 'react'
import { cn } from '@bklearn/shadcn'
import { useAppStore } from './store'

export function Cmdline() {
  const mode = useAppStore((s) => s.mode)
  const cmdBuffer = useAppStore((s) => s.cmdBuffer)
  const cmdArgs = useAppStore((s) => s.cmdArgs)
  const cmdArg = useAppStore((s) => s.cmdArg)
  const cmdSuggestions = useAppStore((s) => s.cmdSuggestions)
  const cmdError = useAppStore((s) => s.cmdError)
  const resetCmdline = useAppStore((s) => s.resetCmdline)

  useEffect(() => {
    if (!cmdError) return
    const t = setTimeout(() => resetCmdline(), 2500)
    return () => clearTimeout(t)
  }, [cmdError, resetCmdline])

  const writing = mode === 'cmdline'

  return (
    <div className="relative flex h-7 items-center gap-1 border-t bg-muted/40 px-3 font-mono text-sm">
      {/* caret turns blue once you're in normal mode, ready to take a command */}
      <span className={mode === 'normal' ? 'text-blue-500' : 'text-muted-foreground'}>{'>'}</span>

      {cmdError ? (
        <span className="text-destructive">{cmdError}</span>
      ) : (
        <>
          {/* expanded command name is colored like a fish autosuggestion once it resolves */}
          <span className={writing ? 'text-blue-500' : undefined}>{cmdBuffer}</span>
          {writing && cmdArgs.length > 0 && <span className="text-muted-foreground">{cmdArgs.join(' ')} </span>}
          {writing && <span>{cmdArg}</span>}
          <BlockCursor />
        </>
      )}

      {cmdSuggestions.length > 0 && (
        <div className="absolute bottom-7 left-3 flex flex-col rounded-md border bg-popover shadow-md">
          {cmdSuggestions.slice(0, 9).map((s, i) => (
            <div
              key={s}
              className={cn('flex gap-2 px-2 py-1 text-sm', i === 0 && 'bg-accent text-accent-foreground')}
            >
              <span className="text-muted-foreground">{i + 1}</span>
              {s}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function BlockCursor() {
  return <span className="inline-block h-4 w-2 bg-green-400/70" />
}
