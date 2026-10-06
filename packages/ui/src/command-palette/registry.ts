import type { PaletteCommand, SearchProvider } from "./types"

const RECENT_LIMIT = 8

export type Registry<Ctx, R> = {
  registerCommands: (cmds: PaletteCommand<Ctx, R>[]) => () => void
  registerProvider: (provider: SearchProvider<Ctx, R>) => () => void
  getCommand: (id: string) => PaletteCommand<Ctx, R> | undefined
  commands: () => PaletteCommand<Ctx, R>[]
  providers: () => SearchProvider<Ctx, R>[]
  /* records a run so it shows under recents */
  markRun: (id: string) => void
  /* recently run command ids, newest first */
  recent: () => string[]
  /* fires when commands or providers change */
  subscribe: (fn: () => void) => () => void
}

export function createRegistry<Ctx, R>(): Registry<Ctx, R> {
  const commands = new Map<string, PaletteCommand<Ctx, R>>()
  const providers = new Map<string, SearchProvider<Ctx, R>>()
  const listeners = new Set<() => void>()
  let recentIds: string[] = []

  const emit = () => {
    for (const fn of listeners) fn()
  }

  function registerCommands(cmds: PaletteCommand<Ctx, R>[]) {
    for (const cmd of cmds) commands.set(cmd.id, cmd)
    emit()
    return () => {
      let changed = false
      for (const cmd of cmds) {
        /* skip ids that were replaced by a later registration */
        if (commands.get(cmd.id) !== cmd) continue
        commands.delete(cmd.id)
        changed = true
      }
      if (changed) emit()
    }
  }

  function registerProvider(provider: SearchProvider<Ctx, R>) {
    providers.set(provider.id, provider)
    emit()
    return () => {
      if (providers.get(provider.id) !== provider) return
      providers.delete(provider.id)
      emit()
    }
  }

  return {
    registerCommands,
    registerProvider,
    getCommand: (id) => commands.get(id),
    commands: () => [...commands.values()],
    providers: () => [...providers.values()],
    markRun: (id) => {
      recentIds = [id, ...recentIds.filter((x) => x !== id)].slice(0, RECENT_LIMIT)
    },
    recent: () => recentIds,
    subscribe: (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
  }
}
