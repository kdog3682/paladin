// @paladin/squire/src/helpers.ts

import { formatGrid } from "./shell/grid"
import { discoverPackages } from "./core/resolve"
import type { Reporter } from "./shell/reporter"
import type { Interface as RLInterface } from "readline"

export function promptLine(rl: RLInterface, reporter: Reporter): Promise<string> {
  return new Promise(resolve => {
    reporter.prompt()
    rl.once("line", line => resolve(line.trim()))
  })
}

export function matchesPkgName(pkg: { name: string, dir: string }, query: string): boolean {
  const q = query.toLowerCase()
  return pkg.name.toLowerCase() === q || pkg.dir.toLowerCase().endsWith(`/${q}`)
}

export function parseDotCommand(input: string): { pkg: string, command: string, args: string } | null {
  const dotIndex = input.indexOf(".")
  if (dotIndex < 0) return null

  const pkg = input.slice(0, dotIndex)
  const rest = input.slice(dotIndex + 1)
  if (!pkg || !rest) return null

  const spaceIndex = rest.indexOf(" ")
  const command = spaceIndex < 0 ? rest : rest.slice(0, spaceIndex)
  const args = spaceIndex < 0 ? "" : rest.slice(spaceIndex + 1).trim()

  return { pkg, command, args }
}

export async function selectFromList(
  rl: RLInterface,
  reporter: Reporter,
  packages: { name: string, dir: string }[]
): Promise<{ name: string, dir: string, pendingCommand?: string } | null> {
  const letters = "abcdefghijklmnopqrstuvwxyz"

  if (packages.length === 0) {
    reporter.warn("no packages found in packages/, libs/, or apps/")
    return null
  }

  reporter.header("available packages")
  console.log(formatGrid(packages.map(p => p.name)))
  reporter.blank()

  const input = await promptLine(rl, reporter)

  const letterIdx = input.length === 1 ? letters.indexOf(input.toLowerCase()) : -1
  if (letterIdx >= 0 && letterIdx < packages.length) {
    return packages[letterIdx]
  }

  const dotParsed = parseDotCommand(input)
  if (dotParsed) {
    const found = packages.find(p => matchesPkgName(p, dotParsed.pkg))
    if (found) {
      const cmd = dotParsed.args ? `${dotParsed.command} ${dotParsed.args}` : dotParsed.command
      return { ...found, pendingCommand: cmd }
    }
    reporter.error(`package '${dotParsed.pkg}' not found`)
    return null
  }

  const found = packages.find(p => matchesPkgName(p, input))
  if (found) return found

  reporter.error(`'${input}' didn't match any package or letter`)
  return null
}

export async function findRoot(): Promise<string> {
  const proc = Bun.spawn(["git", "rev-parse", "--show-toplevel"], {
    stdout: "pipe",
    stderr: "pipe",
  })
  const output = await new Response(proc.stdout).text()
  await proc.exited
  return output.trim() || process.cwd()
}

export async function resolvePkg(
  reporter: Reporter,
  rl: RLInterface,
  root: string,
  name?: string
) {
  const packages = await discoverPackages(root)
  if (name) {
    const found = packages.find(p => matchesPkgName(p, name))
    if (found) return found
    reporter.error(`package '${name}' not found`)
    return null
  }
  return selectFromList(rl, reporter, packages)
}
