import { readFile } from "node:fs/promises"
import { dirname, parse as parsePath, relative, resolve as resolvePath, sep } from "node:path"

export type Root = {
  /** Absolute directory the labels are relative to. */
  dir: string
  /** Package name from the nearest package.json, when there is one. */
  name: string | null
}

export type Labeler = (path: string) => Promise<string>

export function resolveModule(source: string, fromFile: string): string | null {
  try {
    const path = Bun.resolveSync(source, dirname(fromFile))
    if (path.includes(`${sep}node_modules${sep}`)) return null
    if (!/\.(m|c)?tsx?$/.test(path)) return null
    return path
  } catch {
    return null
  }
}

export async function deriveRoot(files: string[]): Promise<Root> {
  const dirs = files.map((file) => dirname(resolvePath(file)))
  const anchor = dirs[0] ?? process.cwd()
  return (await findPackage(anchor, new Map())) ?? { dir: commonDir(dirs), name: null }
}

export function createLabeler(root: Root): Labeler {
  const cache = new Map<string, Promise<Root | null>>()
  return async (path) => {
    if (isInside(root.dir, path)) return posix(relative(root.dir, path))
    const owner = await findPackage(dirname(path), cache)
    if (!owner) return posix(path)
    const rel = posix(relative(owner.dir, path))
    return owner.name === root.name ? rel : `${owner.name}/${rel}`
  }
}

async function findPackage(from: string, cache: Map<string, Promise<Root | null>>): Promise<Root | null> {
  let dir = from
  const stop = parsePath(dir).root
  while (true) {
    let pending = cache.get(dir)
    if (!pending) {
      pending = readPackageName(dir)
      cache.set(dir, pending)
    }
    const found = await pending
    if (found) return found
    if (dir === stop) return null
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

async function readPackageName(dir: string): Promise<Root | null> {
  try {
    const raw = await readFile(resolvePath(dir, "package.json"), "utf8")
    const name = (JSON.parse(raw) as { name?: unknown }).name
    return typeof name === "string" && name.length > 0 ? { dir, name } : null
  } catch {
    return null
  }
}

function commonDir(dirs: string[]): string {
  if (dirs.length === 0) return process.cwd()
  let parts = dirs[0]!.split(sep)
  for (const dir of dirs.slice(1)) {
    const other = dir.split(sep)
    let i = 0
    while (i < parts.length && i < other.length && parts[i] === other[i]) i++
    parts = parts.slice(0, i)
  }
  return parts.join(sep) || sep
}

function isInside(dir: string, path: string): boolean {
  const rel = relative(dir, path)
  return rel.length > 0 && !rel.startsWith("..") && !resolvePath(rel).startsWith(sep)
}

function posix(path: string): string {
  return path.split(sep).join("/")
}
