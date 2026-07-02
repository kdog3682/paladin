import type { useAppStore } from '../store'

export type ArgSpec =
  | {
      kind: 'choice'
      values: readonly string[] | ((ctx: AppContext) => Promise<readonly string[]> | readonly string[])
    }
  | { kind: 'input'; optional?: boolean }

export interface CommandSpec {
  name: string
  abbr: string
  args: readonly ArgSpec[]
  run(ctx: AppContext, args: readonly string[]): void | Promise<void>
}

export interface ApiClient {
  call<T = any>(
    method: string,
    args?: any[],
    onSuccess?: (result: T) => void,
    onError?: (err: unknown) => void
  ): Promise<T>
}

export interface GlobalBinding {
  key: string // canonical form from normalizeKey(), e.g. 'Mod-n', 'Mod-Shift-n'
  run: (ctx: AppContext) => void | Promise<void>
}

// ctx = stable references to the outside world (services + store).
export interface AppContext {
  api: ApiClient
  store: typeof useAppStore
  doc: () => { id: string; project: string; title: string } // the doc open right now
}
