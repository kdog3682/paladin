import { createStore, type StoreApi } from "zustand/vanilla"
import type { Intent } from "./keys"
import { matchKeyword } from "./keyword"
import type { Registry } from "./registry"
import { flattenEntries, isAbortError, searchRoot } from "./search"
import type {
  ArgSpec,
  GroupedEntries,
  OpenOptions,
  Page,
  PaletteCommand,
  PaletteOptions,
  PaletteState,
} from "./types"

export type PaletteActions<Ctx, R> = {
  open: (opts?: OpenOptions) => void
  close: () => void
  setQuery: (query: string) => void
  push: (page: Page<Ctx, R>) => void
  pop: () => void
  replaceTop: (page: Page<Ctx, R>) => void
  move: (delta: number) => void
  /* highlight a row by flat index (rows or completions) */
  select: (index: number) => void
  submit: () => Promise<void>
  /* sets the active argument's value */
  setArg: (value: string) => void
  setActiveArg: (index: number) => void
  setText: (text: string) => void
  /* runs the entry at index, or pushes its page */
  choose: (index?: number) => Promise<void>
  /* pushes the highlighted command's page, empty */
  enterHighlighted: () => void
  /* writes the completion at index into the active argument */
  acceptCompletion: (index?: number) => void
  /* backspace on an empty input: removes a whole chip */
  deleteChip: () => void
  dispatch: (intent: Intent) => void
  /* reruns the search for the current page */
  refresh: () => void
}

export type PaletteStore<Ctx, R> = {
  store: StoreApi<PaletteState<Ctx, R>>
  actions: PaletteActions<Ctx, R>
}

function initialState<Ctx, R>(): PaletteState<Ctx, R> {
  return {
    open: false,
    openOptions: {},
    ctx: undefined,
    pages: [{ type: "root", query: "" }],
    selectedIndex: 0,
    entries: [],
    completions: [],
    loading: false,
    error: undefined,
    returnFocus: null,
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function activeElement() {
  if (typeof document === "undefined") return null
  const el = document.activeElement
  return el instanceof HTMLElement && el !== document.body ? el : null
}

function restoreFocus(el: HTMLElement | null) {
  if (el?.isConnected) el.focus({ preventScroll: true })
}

/* runs after the dialog has unmounted so its focus trap can't steal focus back */
function afterClose(fn: () => void) {
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => fn())
  else setTimeout(fn, 0)
}

function clampIndex<Ctx, R>(index: number, groups: GroupedEntries<Ctx, R>) {
  const n = flattenEntries(groups).length
  return n ? Math.min(index, n - 1) : 0
}

/* earlier args as strings; a multiple arg is its chips joined with "," */
function prevValues<Ctx>(
  args: ArgSpec<Ctx>[],
  values: Record<string, string>,
  upTo: number,
  lists: Record<string, string[]> = {},
) {
  return Object.fromEntries(
    args.slice(0, upTo).map((a) => [a.name, a.multiple ? (lists[a.name] ?? []).join(",") : (values[a.name] ?? "")]),
  )
}

export function createPaletteStore<Ctx, R>(
  registry: Registry<Ctx, R>,
  options: PaletteOptions<Ctx, R>,
): PaletteStore<Ctx, R> {
  const store = createStore<PaletteState<Ctx, R>>(() => initialState<Ctx, R>())
  const get = store.getState
  const set = store.setState

  let controller: AbortController | undefined
  let running = false

  const top = () => {
    const pages = get().pages
    return pages[pages.length - 1]
  }
  const ctx = () => get().ctx as Ctx

  function nextSignal() {
    controller?.abort()
    controller = new AbortController()
    return controller.signal
  }

  function abort() {
    controller?.abort()
    controller = undefined
  }

  /* ---------- searching ---------- */

  function refresh() {
    if (!get().open) return
    const page = top()
    const signal = nextSignal()
    switch (page.type) {
      case "root":
        return refreshRoot(page.query, signal)
      case "list":
        return void refreshList(page, signal)
      case "args":
        return void refreshCompletions(page, signal)
      case "text":
        return set({ entries: [], completions: [], loading: false })
    }
  }

  function refreshRoot(query: string, signal: AbortSignal) {
    const { openOptions } = get()
    const providers = registry
      .providers()
      .filter((p) => !openOptions.providers || openOptions.providers.includes(p.id))

    set({ loading: true })
    void searchRoot({
      query,
      ctx: ctx(),
      signal,
      providers,
      commands: registry.commands(),
      recent: registry.recent(),
      includeCommands: openOptions.commands !== false,
      onUpdate: (entries) => {
        if (signal.aborted) return
        set({ entries, selectedIndex: clampIndex(get().selectedIndex, entries) })
      },
      onProviderError: (id, error) => {
        console.warn(`[command-palette] provider "${id}" failed`, error)
      },
    }).then(() => {
      if (!signal.aborted) set({ loading: false })
    })
  }

  async function refreshList(page: Extract<Page<Ctx, R>, { type: "list" }>, signal: AbortSignal) {
    set({ loading: true })
    try {
      const items = await page.command.items(page.query, ctx(), signal)
      if (signal.aborted) return
      const visible = items.filter(
        (e) => e.kind !== "command" || !e.command.when || e.command.when(ctx()),
      )
      const entries: GroupedEntries<Ctx, R> = visible.length
        ? [{ id: `list:${page.command.id}`, label: "", entries: visible }]
        : []
      set({ entries, loading: false, selectedIndex: clampIndex(get().selectedIndex, entries) })
    } catch (error) {
      if (signal.aborted || isAbortError(error)) return
      set({ entries: [], loading: false, error: errorMessage(error) })
    }
  }

  async function refreshCompletions(page: Extract<Page<Ctx, R>, { type: "args" }>, signal: AbortSignal) {
    const { args } = page.command
    const arg = args[page.activeArg]
    if (!arg?.complete) return set({ completions: [], loading: false })

    set({ loading: true })
    try {
      const partial = page.values[arg.name] ?? ""
      const completions = await arg.complete(
        partial,
        prevValues(args, page.values, page.activeArg, page.lists),
        ctx(),
        signal,
      )
      if (signal.aborted) return
      /* a chip already picked is not offered again */
      const chosen = arg.multiple ? (page.lists[arg.name] ?? []) : []
      set({ completions: completions.filter((c) => !chosen.includes(c.value)), loading: false, selectedIndex: 0 })
    } catch (error) {
      if (signal.aborted || isAbortError(error)) return
      set({ completions: [], loading: false, error: errorMessage(error) })
    }
  }

  /* ---------- pages ---------- */

  function setPages(pages: Page<Ctx, R>[]) {
    set({ pages, selectedIndex: 0, error: undefined, entries: [], completions: [] })
    refresh()
  }

  /* replaces the top page without clearing results, for typing */
  function updateTop(page: Page<Ctx, R>) {
    const pages = get().pages
    set({ pages: [...pages.slice(0, -1), page], selectedIndex: 0, error: undefined })
    refresh()
  }

  function push(page: Page<Ctx, R>) {
    setPages([...get().pages, page])
  }

  function pop() {
    const pages = get().pages
    if (pages.length <= 1) return
    setPages(pages.slice(0, -1))
  }

  function replaceTop(page: Page<Ctx, R>) {
    setPages([...get().pages.slice(0, -1), page])
  }

  function enterCommand(command: PaletteCommand<Ctx, R>, initial = "") {
    switch (command.type) {
      case "action":
        return void execute(() => command.run(ctx()), command)
      case "list":
        return push({ type: "list", command, query: initial })
      case "args": {
        const first = command.args[0]
        if (!first) return void execute(() => command.run({}, ctx()), command)
        return push({ type: "args", command, values: { [first.name]: initial }, lists: {}, activeArg: 0 })
      }
      case "text":
        return push({ type: "text", command, text: initial })
    }
  }

  /* ---------- running ---------- */

  async function execute(fn: () => R | void | Promise<R | void>, command?: PaletteCommand<Ctx, R>) {
    if (running) return
    running = true
    const { pages } = get()
    set({ loading: true, error: undefined })
    try {
      const result = await fn()
      /* recents track the top-level command, not drill-down entries */
      const first = pages[1]
      const recent = first && first.type !== "root" ? first.command : command
      if (recent) registry.markRun(recent.id)
      finish(result)
    } catch (error) {
      if (get().open) set({ loading: false, error: errorMessage(error) })
    } finally {
      running = false
    }
  }

  function reset() {
    abort()
    set(initialState<Ctx, R>())
  }

  function finish(result: R | void) {
    const { ctx: snapshot, returnFocus } = get()
    reset()
    afterClose(() => {
      if (options.onDone) options.onDone(result, snapshot as Ctx)
      else restoreFocus(returnFocus)
    })
  }

  /* ---------- actions ---------- */

  function open(opts: OpenOptions = {}) {
    const prev = get()
    abort()
    /* reopening keeps the original context and focus target */
    const returnFocus = prev.open ? prev.returnFocus : activeElement()
    const snapshot = prev.open ? prev.ctx : options.getContext()

    const command = opts.command ? registry.getCommand(opts.command) : undefined
    if (opts.command && !command) console.warn(`[command-palette] unknown command "${opts.command}"`)

    set({
      ...initialState<Ctx, R>(),
      open: true,
      openOptions: opts,
      ctx: snapshot,
      returnFocus,
      pages: [{ type: "root", query: command ? "" : (opts.initialQuery ?? "") }],
    })

    if (command) enterCommand(command, opts.initialQuery ?? "")
    else refresh()
  }

  function close() {
    const { open, returnFocus } = get()
    if (!open) return
    reset()
    afterClose(() => restoreFocus(returnFocus))
  }

  function setQuery(query: string) {
    const page = top()
    if (page.type === "list") return updateTop({ ...page, query })
    if (page.type !== "root") return

    if (get().openOptions.commands !== false) {
      const match = matchKeyword(query, registry.commands(), ctx())
      if (match) {
        /* leave the keyword on the root page so popping back shows it */
        const pages = get().pages
        set({ pages: [...pages.slice(0, -1), { type: "root", query: match.typed }] })
        return enterCommand(match.command, match.rest)
      }
    }
    updateTop({ ...page, query })
  }

  function rowCount() {
    const { entries, completions } = get()
    return top().type === "args" ? completions.length : flattenEntries(entries).length
  }

  function move(delta: number) {
    const n = rowCount()
    if (!n) return
    const i = get().selectedIndex + delta
    set({ selectedIndex: ((i % n) + n) % n })
  }

  function select(index: number) {
    const n = rowCount()
    if (index >= 0 && index < n) set({ selectedIndex: index })
  }

  async function choose(index = get().selectedIndex) {
    const entry = flattenEntries(get().entries)[index]
    if (!entry) return
    if (entry.kind === "item") return execute(() => entry.item.onSelect(ctx()))
    enterCommand(entry.command)
  }

  function enterHighlighted() {
    const entry = flattenEntries(get().entries)[get().selectedIndex]
    if (entry?.kind === "command" && entry.command.type !== "action") enterCommand(entry.command)
  }

  function setArg(value: string) {
    const page = top()
    if (page.type !== "args") return
    const arg = page.command.args[page.activeArg]
    if (!arg) return
    updateTop({ ...page, values: { ...page.values, [arg.name]: value } })
  }

  function setActiveArg(index: number) {
    const page = top()
    if (page.type !== "args") return
    const next = Math.max(0, Math.min(index, page.command.args.length - 1))
    if (next === page.activeArg) return
    updateTop({ ...page, activeArg: next })
  }

  function acceptCompletion(index = get().selectedIndex) {
    const page = top()
    const completion = get().completions[index]
    if (page.type !== "args" || !completion) return
    const { args } = page.command
    const arg = args[page.activeArg]
    const last = page.activeArg >= args.length - 1

    if (arg.multiple) {
      /* commit as a chip and stay for the next one */
      const list = [...(page.lists[arg.name] ?? []), completion.value]
      return updateTop({
        ...page,
        values: { ...page.values, [arg.name]: "" },
        lists: { ...page.lists, [arg.name]: list },
      })
    }

    const values = { ...page.values, [arg.name]: completion.value }
    if (!arg.nextOnEnter) return updateTop({ ...page, values })
    if (last) {
      updateTop({ ...page, values })
      return void submit()
    }
    /* the next arg's completions open by themselves on the refresh */
    updateTop({ ...page, values, activeArg: page.activeArg + 1 })
  }

  /* backspace on an empty input: drops the last chip of this arg, else the whole previous arg, and lands there */
  function deleteChip() {
    const page = top()
    if (page.type !== "args") return
    const { args } = page.command
    const here = args[page.activeArg]
    if (here?.multiple && page.lists[here.name]?.length) {
      return updateTop({ ...page, lists: { ...page.lists, [here.name]: page.lists[here.name].slice(0, -1) } })
    }
    const index = page.activeArg - 1
    const prev = args[index]
    if (!prev) return
    const list = page.lists[prev.name] ?? []
    updateTop({
      ...page,
      activeArg: index,
      values: { ...page.values, [prev.name]: "" },
      lists: prev.multiple ? { ...page.lists, [prev.name]: list.slice(0, -1) } : page.lists,
    })
  }

  function setText(text: string) {
    const page = top()
    if (page.type !== "text") return
    const pages = get().pages
    set({ pages: [...pages.slice(0, -1), { ...page, text }], error: undefined })
  }

  /* moves to the offending argument and shows the error */
  function failArg(index: number, message: string) {
    setActiveArg(index)
    set({ error: message })
  }

  async function isCompletion(
    page: Extract<Page<Ctx, R>, { type: "args" }>,
    index: number,
    values: Record<string, string>,
  ) {
    const arg = page.command.args[index]
    if (!arg.complete) return true
    const value = values[arg.name]
    const completions =
      index === page.activeArg && !arg.multiple
        ? get().completions
        : await arg.complete(value, prevValues(page.command.args, values, index, page.lists), ctx())
    return completions.some((c) => c.value === value)
  }

  async function submit() {
    const page = top()
    switch (page.type) {
      case "root":
      case "list":
        return choose()

      case "text": {
        const error = page.command.validate?.(page.text)
        if (error) return void set({ error })
        return execute(() => page.command.run(page.text, ctx()), page.command)
      }

      case "args": {
        const { args } = page.command
        const typed = Object.fromEntries(args.map((a) => [a.name, page.values[a.name] ?? ""]))
        const lists: Record<string, string[]> = {}
        for (const arg of args) {
          if (!arg.multiple) continue
          /* whatever is still typed in a multiple arg counts as one more chip */
          const buffer = typed[arg.name].trim()
          lists[arg.name] = [...(page.lists[arg.name] ?? []), ...(buffer ? [buffer] : [])]
        }
        const values = Object.fromEntries(
          args.map((a) => [a.name, a.multiple ? lists[a.name].join(",") : typed[a.name]]),
        )
        for (const [i, arg] of args.entries()) {
          const value = values[arg.name]
          const label = arg.placeholder ?? arg.name
          if (!value.trim()) {
            if (arg.required) return failArg(i, `${label} is required`)
            continue
          }
          if (arg.strict) {
            const picked = arg.multiple ? lists[arg.name] : [value]
            for (const one of picked) {
              if (!(await isCompletion(page, i, { ...values, [arg.name]: one }))) {
                return failArg(i, `Pick ${label} from the list`)
              }
            }
          }
        }
        return execute(() => page.command.run(values, ctx(), lists), page.command)
      }
    }
  }

  function stepArg(delta: number) {
    const page = top()
    if (page.type === "args") setActiveArg(page.activeArg + delta)
  }

  function dispatch(intent: Intent) {
    switch (intent.type) {
      case "pass":
      case "noop":
        return
      case "move":
        return move(intent.delta)
      case "choose":
        return void choose()
      case "enter":
        return enterHighlighted()
      case "accept":
        return acceptCompletion()
      case "nextArg":
        return stepArg(1)
      case "prevArg":
        return stepArg(-1)
      case "deleteChip":
        return deleteChip()
      case "submit":
        return void submit()
      case "pop":
        return pop()
      case "close":
        return close()
    }
  }

  return {
    store,
    actions: {
      open,
      close,
      setQuery,
      push,
      pop,
      replaceTop,
      move,
      select,
      submit,
      setArg,
      setActiveArg,
      setText,
      choose,
      enterHighlighted,
      acceptCompletion,
      deleteChip,
      dispatch,
      refresh,
    },
  }
}

