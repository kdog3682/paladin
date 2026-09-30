import { readdir, stat } from "node:fs/promises"
import { basename, join, resolve } from "node:path"
import { IGNORED_DIRS, PROJECTS } from "../project"

export type PackageInfo = {
  /** package name, ie "utils" */
  name: string
  /** project name, ie "paladin" */
  project: string
  /** absolute path to ~/projects/<project>/packages/<name> */
  root: string
  /** last modified time in ms */
  mtime: number
}

export type FsNode = {
  name: string
  /** absolute path */
  path: string
  kind: "file" | "dir"
  children?: FsNode[]
}

const DAY_MS = 24 * 60 * 60 * 1000

const SOURCE = /\.(ts|tsx|mts|cts)$/

const isIgnored = (name: string) => name.startsWith(".") || IGNORED_DIRS.includes(name)

const entries = (dir: string) => readdir(dir, { withFileTypes: true }).catch(() => [])

/**
 * Every ~/projects/<project>/packages/<name> touched within the last `withinDays`, most recent
 * first. A package's mtime is the newest mtime among its source files, so a `dist` rebuild or a
 * touched node_modules doesn't make it look recent.
 */
export async function listPackages(withinDays = 30): Promise<PackageInfo[]> {
  const cutoff = Date.now() - withinDays * DAY_MS
  const found: PackageInfo[] = []

  for (const project of await entries(PROJECTS)) {
    if (!project.isDirectory() || isIgnored(project.name)) continue

    const dir = join(PROJECTS, project.name, "packages")
    for (const pkg of await entries(dir)) {
      if (!pkg.isDirectory() || isIgnored(pkg.name)) continue

      const root = join(dir, pkg.name)
      const mtime = await latestMtime(root)
      if (mtime < cutoff) continue

      found.push({ name: pkg.name, project: project.name, root, mtime })
    }
  }

  return found.sort((a, b) => b.mtime - a.mtime)
}

/** The file tree under a directory, ignoring dotfiles and build output. Directories sort before files. */
export async function fsTree(root: string): Promise<FsNode> {
  const path = resolve(root)
  const info = await stat(path)
  if (!info.isDirectory()) return { name: basename(path), path, kind: "file" }

  const children: FsNode[] = []
  for (const entry of await entries(path)) {
    if (isIgnored(entry.name)) continue
    const child = join(path, entry.name)
    children.push(entry.isDirectory() ? await fsTree(child) : { name: entry.name, path: child, kind: "file" })
  }
  children.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "dir" ? -1 : 1))

  return { name: basename(path), path, kind: "dir", children }
}

async function latestMtime(dir: string): Promise<number> {
  let latest = 0

  for (const entry of await entries(dir)) {
    if (isIgnored(entry.name)) continue
    const path = join(dir, entry.name)

    if (entry.isDirectory()) {
      latest = Math.max(latest, await latestMtime(path))
      continue
    }
    if (!SOURCE.test(entry.name)) continue

    const info = await stat(path).catch(() => undefined)
    if (info) latest = Math.max(latest, info.mtimeMs)
  }

  return latest
}
