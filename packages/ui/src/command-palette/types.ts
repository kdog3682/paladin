import type { ComponentType } from "react"

export type PaletteIcon = ComponentType<{ className?: string }>

export type ChipColor = "blue" | "green" | "amber" | "rose" | "violet" | "cyan"

export type ArgSpec<Ctx> = {
  name: string
  /* what the arg takes, shown as <placeholder>; defaults to the name */
  placeholder?: string
  required?: boolean
  /* collects several values, each committed as its own chip */
  multiple?: boolean
  /* accepting a completion with Enter also moves to the next arg, or submits on the last */
  nextOnEnter?: boolean
  /* chip color; defaults to cycling by position */
  color?: ChipColor
  /* when true, the value must be picked from completions */
  strict?: boolean
  /* completions for this arg; receives earlier arg values */
  complete?: (
    partial: string,
    prev: Record<string, string>,
    ctx: Ctx,
    signal?: AbortSignal,
  ) => Promise<Completion[]>
}

export type Completion = {
  value: string
  label?: string
  detail?: string
}

type Base<Ctx> = {
  id: string
  title: string
  /* first keyword is the command-mode trigger, the rest are search aliases */
  keywords: string[]
  group?: string
  icon?: PaletteIcon
  /* hide the command when this returns false */
  when?: (ctx: Ctx) => boolean
}

export type ActionCommand<Ctx, R> = Base<Ctx> & {
  type: "action"
  run: (ctx: Ctx) => R | void | Promise<R | void>
}

export type ArgsCommand<Ctx, R> = Base<Ctx> & {
  type: "args"
  args: ArgSpec<Ctx>[]
  /* values has every arg as a string (a multiple arg joined with ","); lists has the multiple ones as arrays */
  run: (
    values: Record<string, string>,
    ctx: Ctx,
    lists: Record<string, string[]>,
  ) => R | void | Promise<R | void>
}

export type ListCommand<Ctx, R> = Base<Ctx> & {
  type: "list"
  placeholder?: string
  /* entries may themselves be commands of any type, which gives drill-down */
  items: (query: string, ctx: Ctx, signal: AbortSignal) => Promise<PaletteEntry<Ctx, R>[]>
}

export type TextCommand<Ctx, R> = Base<Ctx> & {
  type: "text"
  placeholder?: string
  /* return an error message to block submit */
  validate?: (text: string) => string | undefined
  run: (text: string, ctx: Ctx) => R | void | Promise<R | void>
}

export type PaletteCommand<Ctx, R> =
  | ActionCommand<Ctx, R>
  | ArgsCommand<Ctx, R>
  | ListCommand<Ctx, R>
  | TextCommand<Ctx, R>

/* any command that opens a page of its own */
export type PageCommand<Ctx, R> = Exclude<PaletteCommand<Ctx, R>, ActionCommand<Ctx, R>>

export type PaletteItem<Ctx, R> = {
  id: string
  title: string
  subtitle?: string
  icon?: PaletteIcon
  /* higher ranks first within its group */
  score?: number
  onSelect: (ctx: Ctx) => R | void | Promise<R | void>
}

/* a row in any list: a command or a plain selectable item */
export type PaletteEntry<Ctx, R> =
  | { kind: "command"; command: PaletteCommand<Ctx, R> }
  | { kind: "item"; item: PaletteItem<Ctx, R> }

export type SearchProvider<Ctx, R> = {
  id: string
  group: string
  /* max items shown in the merged root list */
  limit: number
  /* debounce in ms; 0 for local providers */
  debounce?: number
  search: (query: string, ctx: Ctx, signal: AbortSignal) => Promise<PaletteItem<Ctx, R>[]>
}

export type EntryGroup<Ctx, R> = {
  /* stable id, used to build row keys */
  id: string
  /* heading above the group; empty hides it */
  label: string
  entries: PaletteEntry<Ctx, R>[]
}

export type GroupedEntries<Ctx, R> = EntryGroup<Ctx, R>[]

export type PaletteOptions<Ctx, R> = {
  /* called on every open to snapshot the host's context */
  getContext: () => Ctx
  /* receives the command's result after the palette closes */
  onDone?: (result: R | void, ctx: Ctx) => void
  /* label for the shortcut hint on a command row */
  getShortcut?: (commandId: string) => string | undefined
}

export type OpenOptions = {
  /* restrict the root page to these provider ids */
  providers?: string[]
  /* include registered commands on the root page, default true */
  commands?: boolean
  placeholder?: string
  /* open directly into a command's page */
  command?: string
  initialQuery?: string
}

export type Page<Ctx, R> =
  | { type: "root"; query: string }
  | { type: "list"; command: ListCommand<Ctx, R>; query: string }
  | {
      type: "args"
      command: ArgsCommand<Ctx, R>
      /* text typed per arg; for a single arg also its committed value */
      values: Record<string, string>
      /* committed chips of the multiple args */
      lists: Record<string, string[]>
      activeArg: number
    }
  | { type: "text"; command: TextCommand<Ctx, R>; text: string }

export type PaletteState<Ctx, R> = {
  open: boolean
  openOptions: OpenOptions
  /* snapshot from getContext() at open */
  ctx?: Ctx
  /* the last page is the active one */
  pages: Page<Ctx, R>[]
  selectedIndex: number
  entries: GroupedEntries<Ctx, R>
  /* completions for the active argument on an args page */
  completions: Completion[]
  loading: boolean
  error?: string
  /* element focused when the palette opened */
  returnFocus: HTMLElement | null
}
