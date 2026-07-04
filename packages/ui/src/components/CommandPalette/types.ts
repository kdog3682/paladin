export type ArgOptionsFn<TContext> = (
  ctx: TContext,
  priorArgs: string[],
) => string[] | Promise<string[]>;

export interface CommandArgDef<TContext> {
  /** 'select' (default when options given) or 'input' for free text */
  type?: 'select' | 'input';
  options?: string[] | ArgOptionsFn<TContext>;
  placeholder?: string;
}

export interface CommandDef<TContext> {
  key: string;
  desc?: string;
  args?: CommandArgDef<TContext>[];
  run: (ctx: TContext, ...args: string[]) => void | Promise<void>;
}

export type CommandSchema<TContext> = CommandDef<TContext>[];
