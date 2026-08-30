import { readdir } from "node:fs/promises"
import { join } from "node:path"
import type { Dirent } from "node:fs"
import type { ScaffoldService } from "../services/scaffold/scaffold"

export type Command = (ctx: ScaffoldService, params: any) => unknown

const SKIP = /^index\.ts$|\.(e2e|test|spec|d)\.ts$/

export class UnknownCommandError extends Error {
  constructor(method: string) {
    super(`unknown command: ${method}`)
  }
}

export class DuplicateCommandError extends Error {
  constructor(name: string, a: string, b: string) {
    super(`duplicate command "${name}" exported by ${a} and ${b}`)
  }
}

const isClass = (fn: Function) => /^class[\s{]/.test(Function.prototype.toString.call(fn))

async function entrypoint(dir: string, entry: Dirent) {
  if (entry.isFile()) {
    if (!entry.name.endsWith(".ts") || SKIP.test(entry.name)) return null
    return join(dir, entry.name)
  }
  if (!entry.isDirectory()) return null
  const inner = await readdir(join(dir, entry.name))
  for (const candidate of [`${entry.name}.ts`, "index.ts"]) {
    if (inner.includes(candidate)) return join(dir, entry.name, candidate)
  }
  return null
}

async function load(dir: string) {
  const commands: Record<string, Command> = {}
  const origin: Record<string, string> = {}

  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = await entrypoint(dir, entry)
    if (!path) continue

    const mod: Record<string, unknown> = await import(path)
    for (const [name, value] of Object.entries(mod)) {
      if (typeof value !== "function" || isClass(value)) continue
      const previous = origin[name]
      if (previous) throw new DuplicateCommandError(name, previous, path)
      commands[name] = value as Command
      origin[name] = path
    }
  }

  return commands
}

let cache: Promise<Record<string, Command>> | undefined

export function getCommands(dir: string = import.meta.dir) {
  cache ??= load(dir)
  return cache
}

export async function dispatch(ctx: ScaffoldService, method: string, params: unknown = {}) {
  const commands = await getCommands()
  const command = commands[method]
  if (!command) throw new UnknownCommandError(method)
  return await command(ctx, params)
}
