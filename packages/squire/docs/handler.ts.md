// @paladin/squire/src/handler.ts

import type { GitOps } from "./shell/git"
import type { IReporter } from "./shell/reporter"
import type { TempWriter } from "./shell/tempwriter"
import type { PkgWatcher } from "./shell/watcher"
import type { Runner } from "./shell/runner"

export type HandleResult = void | "exit"

export type AppState = {
  pkg: string | null
  pkgDir: string | null
  demo: boolean
  test: boolean
  testPattern?: string
}

export type HandlerContext = {
  git: GitOps
  reporter: IReporter
  runner: Runner
  tempWriter?: TempWriter
  state: AppState
  watcher: PkgWatcher | null
  root: string
  onSetPkg?: (name?: string) => Promise<{ name: string, dir: string } | null>
}

export type ParsedArgs = {
  raw: string       // everything after the command name, untouched
  tokens: string[]  // split on whitespace
}

export type Command = {
  name: string
  aliases?: string[]
  args?: string
  description: string
  hints?: string[]
  requiresPkg: boolean
  handler: (args: ParsedArgs, ctx: HandlerContext) => Promise<HandleResult>
}

export function createHandler(commands: Command[]) {
  const lookup = new Map<string, Command>()
  for (const cmd of commands) {
    lookup.set(cmd.name, cmd)
    for (const alias of cmd.aliases ?? []) lookup.set(alias, cmd)
  }

  return async (input: string, ctx: HandlerContext): Promise<HandleResult> => {
    const trimmed = input.trim()
    const spaceIdx = trimmed.indexOf(" ")
    const name = spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx)
    const raw = spaceIdx === -1 ? "" : trimmed.slice(spaceIdx + 1)
    const tokens = raw ? raw.trim().split(/\s+/) : []

    const cmd = lookup.get(name)

    if (!cmd) {
      ctx.reporter.warn(`unknown: ${name} — type 'help' for help`)
      return
    }

    if (cmd.requiresPkg && (!ctx.state.pkg || !ctx.state.pkgDir)) {
      ctx.reporter.error("no package set — use 'set' to pick one")
      return
    }

    return cmd.handler({ raw, tokens }, ctx)
  }
}

export function generateHelp(commands: Command[], reporter: IReporter) {
  reporter.header("squire — help")
  reporter.blank()

  const entries = commands.map(cmd => {
    const label = cmd.args ? `${cmd.name} ${cmd.args}` : cmd.name
    return { label, description: cmd.description }
  })

  const maxLabel = Math.max(...entries.map(e => e.label.length))

  reporter.line("commands")
  for (const e of entries) {
    reporter.line(`  ${e.label.padEnd(maxLabel + 2)} ${e.description}`)
  }

  const allHints = commands.flatMap(cmd => cmd.hints ?? [])
  if (allHints.length > 0) {
    reporter.blank()
    reporter.line("hints")
    for (const h of allHints) {
      reporter.line(`  ${h}`)
    }
  }

  reporter.blank()
}
