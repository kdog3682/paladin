type Dispose<T> = (value: T) => unknown

type Entry = {
  value: unknown
  dispose?: Dispose<any>
}

declare global {
  var __paladinHot: Map<string, Entry> | undefined
}

// globalThis is the only thing that survives a `bun --hot` re-evaluation
const registry = (globalThis.__paladinHot ??= new Map<string, Entry>())

/**
 * Create once per process. Later reloads get the same instance back and the
 * factory never runs again. Use for anything holding state you want to keep:
 * connection pools, socket sets, service instances.
 */
export function keep<T>(key: string, create: () => T): T {
  const existing = registry.get(key)
  if (existing) return existing.value as T

  const value = create()
  registry.set(key, { value })
  return value
}

/**
 * Dispose the previous value, then build a fresh one. Use for anything that
 * closes over code you want reloaded — watchers, intervals, subscriptions.
 * Disposal is fire-and-forget; the new value is returned synchronously.
 */
export function replace<T>(key: string, create: () => T, dispose: Dispose<T>): T {
  const existing = registry.get(key)
  if (existing) void existing.dispose?.(existing.value)

  const value = create()
  registry.set(key, { value, dispose })
  return value
}

/**
 * Signal handlers that get swapped rather than stacked. Without this you add a
 * listener per reload and hit the max-listeners warning after ten saves.
 */
export function onSignal(signals: NodeJS.Signals[], handler: () => unknown) {
  replace(
    `signal:${signals.join(",")}`,
    () => {
      const listener = () => void handler()
      for (const signal of signals) process.on(signal, listener)
      return listener
    },
    (listener) => {
      for (const signal of signals) process.off(signal, listener)
    },
  )
}

/** Tear down everything currently registered. Call from your shutdown path. */
export async function disposeAll() {
  for (const [key, entry] of registry) {
    await entry.dispose?.(entry.value)
    registry.delete(key)
  }
}
