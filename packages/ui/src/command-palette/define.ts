import type {
  ActionCommand,
  ArgSpec,
  ArgsCommand,
  ListCommand,
  PaletteCommand,
  PaletteEntry,
  PaletteItem,
  TextCommand,
} from "./types"

type Def<C> = Omit<C, "type">

export function defineAction<Ctx, R = void>(cmd: Def<ActionCommand<Ctx, R>>): ActionCommand<Ctx, R> {
  return { ...cmd, type: "action" }
}

export function defineArgs<Ctx, R = void>(cmd: Def<ArgsCommand<Ctx, R>>): ArgsCommand<Ctx, R> {
  return { ...cmd, type: "args" }
}

export function defineList<Ctx, R = void>(cmd: Def<ListCommand<Ctx, R>>): ListCommand<Ctx, R> {
  return { ...cmd, type: "list" }
}

export function defineText<Ctx, R = void>(cmd: Def<TextCommand<Ctx, R>>): TextCommand<Ctx, R> {
  return { ...cmd, type: "text" }
}

/* binds Ctx and R once so every definition infers its callback params */
export function createDefiners<Ctx, R = void>() {
  return {
    defineAction: (cmd: Def<ActionCommand<Ctx, R>>) => defineAction<Ctx, R>(cmd),
    defineArgs: (cmd: Def<ArgsCommand<Ctx, R>>) => defineArgs<Ctx, R>(cmd),
    defineList: (cmd: Def<ListCommand<Ctx, R>>) => defineList<Ctx, R>(cmd),
    defineText: (cmd: Def<TextCommand<Ctx, R>>) => defineText<Ctx, R>(cmd),
  }
}

/* wraps a command as a list entry */
export function commandEntry<Ctx, R>(command: PaletteCommand<Ctx, R>): PaletteEntry<Ctx, R> {
  return { kind: "command", command }
}

/* wraps a plain item as a list entry */
export function itemEntry<Ctx, R>(item: PaletteItem<Ctx, R>): PaletteEntry<Ctx, R> {
  return { kind: "item", item }
}

/* how an arg reads in a signature: <path> required, [path] optional, <file...> multiple */
export function argLabel(arg: ArgSpec<never>) {
  const name = (arg.placeholder ?? arg.name) + (arg.multiple ? "..." : "")
  return arg.required ? `<${name}>` : `[${name}]`
}
