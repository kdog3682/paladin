// @paladin/web/src/stores/commandRegistry.ts
import { create } from 'zustand'

export type ArgDef = {
  name: string
  type: 'text' | 'autocomplete'
  resolve?: (partial: string) => string[] | Promise<string[]>
}

export type CommandDef = {
  id: string
  label: string
  scope: string
  args: ArgDef[]
  execute: (args: Record<string, string>) => void | Promise<void>
}

type CommandRegistryState = {
  commands: Map<string, CommandDef>
  register: (commands: CommandDef[]) => void
  unregister: (ids: string[]) => void
  getAll: () => CommandDef[]
  search: (query: string) => CommandDef[]
}

export const useCommandRegistry = create<CommandRegistryState>((set, get) => ({
  commands: new Map(),

  register: (commands) => set((state) => {
    const next = new Map(state.commands)
    for (const cmd of commands) next.set(cmd.id, cmd)
    return { commands: next }
  }),

  unregister: (ids) => set((state) => {
    const next = new Map(state.commands)
    for (const id of ids) next.delete(id)
    return { commands: next }
  }),

  getAll: () => [...get().commands.values()],

  search: (query) => {
    const q = query.toLowerCase().trim()
    if (!q) return [...get().commands.values()]
    return [...get().commands.values()].filter(
      (cmd) => cmd.label.toLowerCase().includes(q) || cmd.id.toLowerCase().includes(q)
    )
  },
}))
