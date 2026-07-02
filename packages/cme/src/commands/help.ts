import type { CommandSpec, GlobalBinding } from './types'

export interface HelpEntry {
  keys: string
  description: string
}

// compiles every cmdline command + global binding into one reference list, shown via Ctrl-/
export function buildHelpEntries(commands: readonly CommandSpec[], bindings: readonly GlobalBinding[]): HelpEntry[] {
  const cmdEntries = commands.map((c) => ({
    keys: c.abbr,
    description: c.args.length ? `${c.name} <${c.args.map((a) => a.kind).join('> <')}>` : c.name,
  }))
  const bindingEntries = bindings.map((b) => ({
    keys: b.key,
    description: b.run.name || 'action',
  }))
  return [...cmdEntries, ...bindingEntries]
}
