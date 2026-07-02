import { commands, findByAbbr } from './registry'
import type { AppContext, CommandSpec } from './types'

// pre-fills the cmdline as if the user typed `abbr `+space — e.g. right after creating an unnamed doc
export function activateCmdline(ctx: AppContext, abbr: string) {
  const cmd = findByAbbr(abbr)
  if (!cmd) return
  ctx.store.getState().setCmdline({ cmdCommand: cmd, cmdBuffer: `${cmd.name} `, cmdArgs: [], cmdArgIndex: 0, cmdArg: '' })
  ctx.store.getState().setMode('cmdline')
  loadSuggestions(cmd, ctx, 0, '')
}

export function handleNormalKey(e: KeyboardEvent, ctx: AppContext) {
  if (e.ctrlKey || e.metaKey || e.altKey) return // global keymap owns these

  const s = ctx.store.getState()
  if (s.mode === 'insert') return
  if (s.mode === 'cmdline') {
    handleWritingKey(e, ctx)
    return
  }
  handleBufferingKey(e, ctx)
}

// mode === 'normal': accumulating abbr chars, immediately dispatches zero-arg matches
function handleBufferingKey(e: KeyboardEvent, ctx: AppContext) {
  const s = ctx.store.getState()

  if (e.key === 'Escape') {
    if (!s.cmdBuffer) return // nothing to clear
    e.preventDefault()
    ctx.store.getState().resetCmdline()
    return
  }

  if (e.key === 'Backspace') {
    if (!s.cmdBuffer) return
    e.preventDefault()
    ctx.store.getState().setCmdline({ cmdBuffer: s.cmdBuffer.slice(0, -1) })
    return
  }

  if (e.key === ' ' && s.cmdBuffer) {
    const cmd = findByAbbr(s.cmdBuffer)
    if (cmd && cmd.args.length > 0) {
      e.preventDefault()
      activateCmdline(ctx, cmd.abbr)
    }
    return
  }

  if (e.key.length !== 1) return
  e.preventDefault()
  const buffer = s.cmdBuffer + e.key
  const exact = findByAbbr(buffer)
  if (exact && exact.args.length === 0) {
    exact.run(ctx, [])
    ctx.store.getState().resetCmdline()
    return
  }
  ctx.store.getState().setCmdline({ cmdBuffer: buffer })
}

// mode === 'cmdline': writing one arg at a time, no dispatch until Enter
function handleWritingKey(e: KeyboardEvent, ctx: AppContext) {
  const s = ctx.store.getState()
  const cmd = s.cmdCommand
  if (!cmd) return

  if (e.key === 'Enter') {
    e.preventDefault()
    submitArg(cmd, ctx)
    return
  }

  if (e.key === 'Escape') {
    e.preventDefault()
    ctx.store.getState().resetCmdline()
    ctx.store.getState().setMode('normal')
    return
  }

  if (e.key === 'Tab') {
    e.preventDefault()
    const first = s.cmdSuggestions[0]
    if (first) ctx.store.getState().setCmdline({ cmdArg: first })
    return
  }

  // number keys pick a suggestion directly, like fzf
  if (/^[1-9]$/.test(e.key) && s.cmdSuggestions.length > 0) {
    e.preventDefault()
    const picked = s.cmdSuggestions[Number(e.key) - 1]
    if (picked) ctx.store.getState().setCmdline({ cmdArg: picked })
    return
  }

  if (e.key === 'Backspace') {
    e.preventDefault()
    const words = s.cmdArg.split(' ')
    words.pop()
    const cmdArg = words.join(' ')
    ctx.store.getState().setCmdline({ cmdArg })
    loadSuggestions(cmd, ctx, s.cmdArgIndex, cmdArg)
    return
  }

  if (e.key === ' ' || e.key.length === 1) {
    e.preventDefault()
    const cmdArg = s.cmdArg + e.key
    ctx.store.getState().setCmdline({ cmdArg })
    loadSuggestions(cmd, ctx, s.cmdArgIndex, cmdArg)
  }
}

// Enter on the current arg: required-but-empty stays put, otherwise advance to
// the next arg (loading its suggestions if it's a choice) or run the command
function submitArg(cmd: CommandSpec, ctx: AppContext) {
  const s = ctx.store.getState()
  const argSpec = cmd.args[s.cmdArgIndex]
  const value = s.cmdArg.trim()
  const optional = argSpec && 'optional' in argSpec && argSpec.optional

  if (argSpec && !value && !optional) return // nothing there and it's required — early return

  const cmdArgs = [...s.cmdArgs, value]
  const nextIndex = s.cmdArgIndex + 1

  if (nextIndex < cmd.args.length) {
    ctx.store.getState().setCmdline({ cmdArgs, cmdArgIndex: nextIndex, cmdArg: '' })
    loadSuggestions(cmd, ctx, nextIndex, '')
    return
  }

  cmd.run(ctx, cmdArgs)
  ctx.store.getState().resetCmdline()
  ctx.store.getState().setMode('normal')
}

async function loadSuggestions(cmd: CommandSpec, ctx: AppContext, argIndex: number, query: string) {
  const spec = cmd.args[argIndex]
  if (!spec || spec.kind !== 'choice') {
    ctx.store.getState().setCmdline({ cmdSuggestions: [] })
    return
  }
  const values = typeof spec.values === 'function' ? await spec.values(ctx) : spec.values
  const filtered = values.filter((v) => v.toLowerCase().includes(query.trim().toLowerCase()))
  ctx.store.getState().setCmdline({ cmdSuggestions: filtered })
}

export { commands }
