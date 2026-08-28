import { foobar } from "./foobar"
import type { ScaffoldService } from "../scaffold"

export type Command = (ctx: ScaffoldService, kwargs?: any) => unknown

export const commands = {
  foobar,
} satisfies Record<string, Command>

export type CommandName = keyof typeof commands

export class UnknownCommandError extends Error {
  constructor(method: string) {
    super(`unknown command: ${method}`)
  }
}

export async function dispatch(ctx: ScaffoldService, method: string, kwargs?: unknown) {
  const commandsByName: Record<string, Command> = commands
  const command = commandsByName[method]
  if (!command) throw new UnknownCommandError(method)
  return await command(ctx, kwargs)
}
