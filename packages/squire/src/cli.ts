// @paladin/squire/src/cli.ts

import { StatusBar } from "./shell/statusbar"
import { GitOps } from "./shell/git"
import { Reporter } from "./shell/reporter"
import { Runner } from "./shell/runner"
import { TempWriter } from "./shell/tempwriter"
import { resolveCurrentPkg } from "./core/resolve"
import { createHandler, type AppState } from "./handler"
import { getDefaultPkg, setDefaultPkg } from "./config"
import { commands } from "./commands"
import { createInterface } from "readline"
import {
  promptLine,
  parseDotCommand,
  findRoot,
  resolvePkg,
} from "./helpers"

const sym = Symbol.for("squire:rl")
const g = globalThis as Record<symbol, any>

if (g[sym]) {
  g[sym].close()
  process.stdin.removeAllListeners()
}

const rl = createInterface({ input: process.stdin, output: process.stdout })
g[sym] = rl

async function initPackage(
  reporter: Reporter,
  root: string
): Promise<{ pkg: string, pkgDir: string, pendingCommand?: string } | null> {
  const cwd = process.cwd()
  const result = await resolveCurrentPkg(cwd, root)

  if (result.kind === "found") {
    reporter.success(`detected package: ${result.pkg}`)
    reporter.info(`  → ${result.pkgDir}`)
    return { pkg: result.pkg, pkgDir: result.pkgDir }
  }

  const defaultPkg = await getDefaultPkg(root)
  if (defaultPkg) {
    reporter.success(`loaded default: ${defaultPkg.pkg}`)
    reporter.info(`  → ${defaultPkg.pkgDir}`)
    return defaultPkg
  }

  if (result.kind === "root") {
    reporter.info("you're at the monorepo root")
  } else {
    reporter.info("could not detect a package from current directory")
  }

  const selected = await resolvePkg(reporter, rl, root)
  if (!selected) return null
  return { pkg: selected.name, pkgDir: selected.dir, pendingCommand: selected.pendingCommand }
}

async function main() {
  const reporter = new Reporter()
  const root = await findRoot()
  const git = new GitOps(root)
  const tempWriter = new TempWriter(reporter)
  const runner = new Runner(root, reporter, tempWriter)
  const statusBar = new StatusBar()
  const handle = createHandler(commands)

  const safeHandle = async (input: string, ctx: any) => {
    try {
      return await handle(input, ctx)
    } catch (e: any) {
      reporter.error(e.message ?? String(e))
      return null
    }
  }

  const state: AppState = {
    pkg: null,
    pkgDir: null,
    demo: false,
    test: false,
  }

  const ctx = {
    git,
    reporter,
    runner,
    tempWriter,
    state,
    root,
    watcher: null,
    onSetPkg: (name?: string) => resolvePkg(reporter, rl, root, name),
  }

  const init = async () => {
    statusBar.init()
    reporter.header("squire")
    const initial = await initPackage(reporter, root)
    state.pkg = initial?.pkg ?? null
    state.pkgDir = initial?.pkgDir ?? null
    state.demo = false
    state.test = false

    if (state.pkg) {
      reporter.success(`ready — ${state.pkg}`)
    } else {
      reporter.warn("no package selected — use 'set' to pick one")
    }
    console.log()
    statusBar.render(state)

    return initial?.pendingCommand ?? null
  }

  let pendingCommand = await init()

  rl.on("close", () => process.exit(0))

  while (true) {
    let input: string

    if (pendingCommand) {
      input = pendingCommand
      pendingCommand = null
      reporter.info(`running: ${input}`)
    } else {
      input = await promptLine(rl, reporter)
      if (!input) continue
    }

    const dotCmd = parseDotCommand(input)
    if (dotCmd) {
      if (dotCmd.command === "default") {
        const selected = await resolvePkg(reporter, rl, root, dotCmd.pkg)
        if (selected) {
          await setDefaultPkg(root, selected.name, selected.dir)
          state.pkg = selected.name
          state.pkgDir = selected.dir
          reporter.success(`default set to: ${selected.name}`)
        }
        continue
      }

      const selected = await resolvePkg(reporter, rl, root, dotCmd.pkg)
      if (!selected) continue
      state.pkg = selected.name
      state.pkgDir = selected.dir
      reporter.success(`switched to: ${selected.name}`)

      const fullInput = dotCmd.args ? `${dotCmd.command} ${dotCmd.args}` : dotCmd.command
      const result = await safeHandle(fullInput, ctx)
      if (result === "exit") { rl.close(); process.exit(0) }
      if (result === "restart") { pendingCommand = await init() }
      continue
    }

    if (input === "set default") {
      if (state.pkg && state.pkgDir) {
        await setDefaultPkg(root, state.pkg, state.pkgDir)
        reporter.success(`default set to: ${state.pkg}`)
      } else {
        reporter.warn("no package selected to set as default")
      }
      continue
    }

    const result = await safeHandle(input, ctx)
    if (result === "exit") { rl.close(); process.exit(0) }
    if (result === "restart") { pendingCommand = await init() }
  }
}

main()
