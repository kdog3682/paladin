import { rankCommands } from "./rank"
import type {
  EntryGroup,
  GroupedEntries,
  PaletteCommand,
  PaletteEntry,
  PaletteItem,
  SearchProvider,
} from "./types"

export const COMMANDS_GROUP = "Commands"
export const RECENT_GROUP = "Recent"

export function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError"
}

function abortError() {
  return new DOMException("Aborted", "AbortError")
}

/* resolves after ms, rejects with AbortError if the signal fires first */
export function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(abortError())
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer)
        reject(abortError())
      },
      { once: true },
    )
  })
}

export function flattenEntries<Ctx, R>(groups: GroupedEntries<Ctx, R>): PaletteEntry<Ctx, R>[] {
  return groups.flatMap((g) => g.entries)
}

export function entryId<Ctx, R>(entry: PaletteEntry<Ctx, R>) {
  return entry.kind === "command" ? `command:${entry.command.id}` : `item:${entry.item.id}`
}

function asCommandEntries<Ctx, R>(commands: PaletteCommand<Ctx, R>[]): PaletteEntry<Ctx, R>[] {
  return commands.map((command) => ({ kind: "command", command }))
}

function commandGroups<Ctx, R>(
  query: string,
  commands: PaletteCommand<Ctx, R>[],
  recent: string[],
  ctx: Ctx,
): GroupedEntries<Ctx, R> {
  const ranked = rankCommands(query, commands, ctx)

  if (query.trim()) {
    if (!ranked.length) return []
    return [{ id: "commands", label: COMMANDS_GROUP, entries: asCommandEntries(ranked) }]
  }

  const byId = new Map(ranked.map((c) => [c.id, c]))
  const recentCmds = recent.flatMap((id) => {
    const cmd = byId.get(id)
    return cmd ? [cmd] : []
  })
  const recentIds = new Set(recentCmds.map((c) => c.id))

  const groups: GroupedEntries<Ctx, R> = []
  if (recentCmds.length) {
    groups.push({ id: "recent", label: RECENT_GROUP, entries: asCommandEntries(recentCmds) })
  }

  /* with an empty query the remaining commands are grouped by their own group */
  const byGroup = new Map<string, PaletteCommand<Ctx, R>[]>()
  for (const cmd of ranked) {
    if (recentIds.has(cmd.id)) continue
    const label = cmd.group ?? COMMANDS_GROUP
    const list = byGroup.get(label) ?? []
    list.push(cmd)
    byGroup.set(label, list)
  }
  for (const [label, list] of byGroup) {
    groups.push({ id: `commands:${label}`, label, entries: asCommandEntries(list) })
  }
  return groups
}

function providerGroups<Ctx, R>(
  providers: SearchProvider<Ctx, R>[],
  results: Map<string, PaletteItem<Ctx, R>[]>,
): GroupedEntries<Ctx, R> {
  const byGroup = new Map<string, PaletteItem<Ctx, R>[]>()
  for (const provider of providers) {
    const items = results.get(provider.id)
    if (!items?.length) continue
    const capped = [...items]
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .slice(0, provider.limit)
    byGroup.set(provider.group, [...(byGroup.get(provider.group) ?? []), ...capped])
  }

  const groups: EntryGroup<Ctx, R>[] = []
  for (const [label, items] of byGroup) {
    const sorted = [...items].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    groups.push({
      id: `provider:${label}`,
      label,
      entries: sorted.map((item) => ({ kind: "item", item })),
    })
  }
  return groups
}

export type RootSearchInput<Ctx, R> = {
  query: string
  ctx: Ctx
  commands: PaletteCommand<Ctx, R>[]
  providers: SearchProvider<Ctx, R>[]
  /* recently run command ids, newest first */
  recent: string[]
  /* include commands in the results */
  includeCommands: boolean
  signal: AbortSignal
  /* called with the merged groups each time a provider settles */
  onUpdate: (groups: GroupedEntries<Ctx, R>) => void
  onProviderError?: (providerId: string, error: unknown) => void
}

/*
 * runs every provider in parallel and merges them under the commands.
 * results stream in through onUpdate; the promise resolves once all settle.
 */
export async function searchRoot<Ctx, R>(input: RootSearchInput<Ctx, R>): Promise<GroupedEntries<Ctx, R>> {
  const { query, ctx, signal, providers } = input
  const commands = input.includeCommands
    ? commandGroups(query, input.commands, input.recent, ctx)
    : []
  const results = new Map<string, PaletteItem<Ctx, R>[]>()
  const merge = () => [...commands, ...providerGroups(providers, results)]

  input.onUpdate(merge())

  await Promise.all(
    providers.map(async (provider) => {
      try {
        if (provider.debounce) await sleep(provider.debounce, signal)
        const items = await provider.search(query, ctx, signal)
        if (signal.aborted) return
        results.set(provider.id, items)
        input.onUpdate(merge())
      } catch (error) {
        if (signal.aborted || isAbortError(error)) return
        input.onProviderError?.(provider.id, error)
      }
    }),
  )

  return merge()
}
