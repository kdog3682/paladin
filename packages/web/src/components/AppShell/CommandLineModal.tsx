// @paladin/web/src/components/AppShell/CommandLineModal.tsx
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Dialog, DialogContent } from '@bklearn/shadcn'
import { useCommandRegistry, type CommandDef, type ArgDef } from '../../stores/commandRegistry'

type Phase =
  | { step: 'command', query: string }
  | { step: 'arg', command: CommandDef, argIndex: number, collected: Record<string, string>, query: string }

type Props = {
  open: boolean
  onClose: () => void
}

export function CommandLineModal({ open, onClose }: Props) {
  const [phase, setPhase] = useState<Phase>({ step: 'command', query: '' })
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [completions, setCompletions] = useState<string[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const { search, getAll } = useCommandRegistry()

  // reset on open
  useEffect(() => {
    if (open) {
      setPhase({ step: 'command', query: '' })
      setSelectedIndex(0)
      setCompletions([])
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [open])

  const matchedCommands = useMemo(() => {
    if (phase.step !== 'command') return []
    return phase.query ? search(phase.query) : getAll()
  }, [phase, search, getAll])

  // resolve autocomplete options for arg phase
  useEffect(() => {
    if (phase.step !== 'arg') return
    const argDef = phase.command.args[phase.argIndex]
    if (argDef.type === 'autocomplete' && argDef.resolve) {
      let cancelled = false
      Promise.resolve(argDef.resolve(phase.query)).then((results) => {
        if (!cancelled) {
          setCompletions(results)
          setSelectedIndex(0)
        }
      })
      return () => { cancelled = true }
    } else {
      setCompletions([])
    }
  }, [phase])

  const currentArgDef: ArgDef | null = phase.step === 'arg' ? phase.command.args[phase.argIndex] : null
  const displayItems = phase.step === 'command' ? matchedCommands : completions

  const advanceArg = useCallback((command: CommandDef, argIndex: number, collected: Record<string, string>, value: string) => {
    const argDef = command.args[argIndex]
    const nextCollected = { ...collected, [argDef.name]: value }
    const nextArgIndex = argIndex + 1

    if (nextArgIndex >= command.args.length) {
      command.execute(nextCollected)
      onClose()
    } else {
      setPhase({ step: 'arg', command, argIndex: nextArgIndex, collected: nextCollected, query: '' })
      setSelectedIndex(0)
    }
  }, [onClose])

  const selectCommand = useCallback((cmd: CommandDef) => {
    if (cmd.args.length === 0) {
      cmd.execute({})
      onClose()
    } else {
      setPhase({ step: 'arg', command: cmd, argIndex: 0, collected: {}, query: '' })
      setSelectedIndex(0)
    }
  }, [onClose])

  const handleSubmit = useCallback(() => {
    if (phase.step === 'command') {
      const cmd = matchedCommands[selectedIndex]
      if (cmd) selectCommand(cmd)
    } else {
      const items = completions
      if (currentArgDef?.type === 'autocomplete' && items.length > 0) {
        advanceArg(phase.command, phase.argIndex, phase.collected, items[selectedIndex] ?? phase.query)
      } else if (phase.query.trim()) {
        advanceArg(phase.command, phase.argIndex, phase.collected, phase.query.trim())
      }
    }
  }, [phase, matchedCommands, completions, selectedIndex, currentArgDef, selectCommand, advanceArg])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const query = phase.step === 'command' ? phase.query : phase.query

    if (e.key === 'Escape') {
      e.preventDefault()
      if (query) {
        if (phase.step === 'command') {
          setPhase({ step: 'command', query: '' })
        } else {
          setPhase({ ...phase, query: '' })
        }
      } else {
        onClose()
      }
      return
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      const len = phase.step === 'command' ? matchedCommands.length : completions.length
      setSelectedIndex((i) => Math.min(i + 1, len - 1))
      return
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((i) => Math.max(i - 1, 0))
      return
    }

    if (e.key === 'Tab' && phase.step === 'arg' && currentArgDef?.type === 'autocomplete' && completions.length > 0) {
      e.preventDefault()
      const val = completions[selectedIndex]
      if (val) {
        setPhase({ ...phase, query: val })
      }
      return
    }

    if (e.key === 'Enter') {
      e.preventDefault()
      handleSubmit()
    }
  }, [phase, matchedCommands, completions, selectedIndex, currentArgDef, onClose, handleSubmit])

  const updateQuery = useCallback((value: string) => {
    if (phase.step === 'command') {
      setPhase({ step: 'command', query: value })
    } else {
      setPhase({ ...phase, query: value })
    }
    setSelectedIndex(0)
  }, [phase])

  const promptLabel = useMemo(() => {
    if (phase.step === 'command') return ''
    const parts = [phase.command.label]
    for (let i = 0; i < phase.argIndex; i++) {
      const name = phase.command.args[i].name
      parts.push(phase.collected[name] ?? '')
    }
    return parts.join(' ') + ` <${currentArgDef?.name}>`
  }, [phase, currentArgDef])

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="flex flex-col max-w-2xl h-[28rem] p-0 gap-0 bg-zinc-950 border-zinc-800">
        {/* completions area */}
        <div className="flex-1 overflow-y-auto p-2">
          {phase.step === 'command' ? (
            matchedCommands.length === 0 ? (
              <p className="px-3 py-2 text-sm text-zinc-500">No commands found</p>
            ) : (
              matchedCommands.map((cmd, i) => (
                <button
                  key={cmd.id}
                  onClick={() => selectCommand(cmd)}
                  className={`flex w-full items-center justify-between rounded px-3 py-2 text-sm transition-colors ${
                    i === selectedIndex
                      ? 'bg-zinc-800 text-zinc-100'
                      : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'
                  }`}
                >
                  <span>{cmd.label}</span>
                  <span className="text-xs text-zinc-600">{cmd.scope}</span>
                </button>
              ))
            )
          ) : (
            completions.length === 0 ? (
              <p className="px-3 py-2 text-sm text-zinc-500">
                {currentArgDef?.type === 'autocomplete' ? 'Type to search…' : `Enter ${currentArgDef?.name}…`}
              </p>
            ) : (
              completions.map((item, i) => (
                <button
                  key={item}
                  onClick={() => advanceArg(phase.command, phase.argIndex, phase.collected, item)}
                  className={`flex w-full items-center rounded px-3 py-2 text-sm transition-colors ${
                    i === selectedIndex
                      ? 'bg-zinc-800 text-zinc-100'
                      : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'
                  }`}
                >
                  {item}
                </button>
              ))
            )
          )}
        </div>

        {/* input area */}
        <div className="flex items-center gap-2 border-t border-zinc-800 px-4 py-3">
          {promptLabel && (
            <span className="shrink-0 text-xs text-zinc-500 font-mono">{promptLabel}</span>
          )}
          <span className="shrink-0 text-zinc-500 font-mono text-sm">&gt;</span>
          <input
            ref={inputRef}
            value={phase.step === 'command' ? phase.query : phase.query}
            onChange={(e) => updateQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={phase.step === 'command' ? 'Type a command…' : `${currentArgDef?.name}…`}
            className="flex-1 bg-transparent text-sm text-zinc-100 placeholder-zinc-600 outline-none font-mono"
            spellCheck={false}
            autoComplete="off"
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
