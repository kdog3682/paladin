#!/usr/bin/env bun
import { chmod, lstat, mkdir, symlink, unlink } from "node:fs/promises"
import { homedir } from "node:os"
import { basename, dirname, join, resolve } from "node:path"

const NAMES_PATH = join(dirname(import.meta.path), "forbiddenBinNames.json")

interface ForbiddenNames {
  builtin: string[]
  user: Record<string, string>
}

/** build-react-app.bin.ts -> bra; a single word keeps its name. */
export function abbreviate(file: string): string {
  const stem = basename(file).replace(/\.bin\.[cm]?[jt]sx?$/, "")
  const words = stem
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
  if (words.length < 2) return stem.toLowerCase()
  return words.map((word) => word[0]).join("").toLowerCase()
}

export async function setupBinCommand(file: string, name = abbreviate(file)) {
  const target = resolve(file)
  const dir = join(homedir(), ".local", "bin")
  const link = join(dir, name)

  const names: ForbiddenNames = await Bun.file(NAMES_PATH).json()
  if (names.builtin.includes(name)) throw new Error(`"${name}" is a builtin or existing command; pass a different name`)
  const owner = names.user[name]
  if (owner && owner !== target) throw new Error(`"${name}" is already used by ${owner}; pass a different name`)

  const text = await Bun.file(target).text()
  if (!text.startsWith("#!")) await Bun.write(target, `#!/usr/bin/env bun\n${text}`)
  await chmod(target, 0o755)

  await mkdir(dir, { recursive: true })
  const existing = await lstat(link).catch(() => null)
  if (existing) {
    if (!existing.isSymbolicLink()) throw new Error(`${link} exists and is not a symlink`)
    await unlink(link)
  }
  await symlink(target, link)
  names.user[name] = target
  await Bun.write(NAMES_PATH, JSON.stringify(names, null, 1) + "\n")
  return { name, link, target }
}

if (import.meta.main) {
  for (const file of process.argv.slice(2)) {
    const { name, link } = await setupBinCommand(file)
    console.log(`${name} -> ${link}`)
  }
}
