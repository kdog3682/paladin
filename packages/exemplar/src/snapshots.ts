/*
baselines and pictures live outside the repo, one dir per examples file:
  ~/.paladin/cache/exemplar/<flattened path>/cache.json
  ~/.paladin/cache/exemplar/<flattened path>/<item>.<hash>.png
the hash is of the serialized output, so a picture always matches its output.
cache.json records its source path so orphaned dirs can be cleaned up.
*/
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join, relative } from "node:path"

export const CACHE_ROOT = join(homedir(), ".paladin/cache/exemplar")

type BaselineFile = {
  /* absolute path of the examples file this dir belongs to */
  source: string
  /* item name -> accepted serialized output */
  items: Record<string, string>
}

/* home-relative when possible, to keep dir names short */
export function flatten(abspath: string) {
  const rel = relative(homedir(), abspath)
  const base = rel.startsWith("..") ? abspath.replace(/^\/+/, "") : rel
  return base.replaceAll("/", "__")
}

export function snapshotDir(abspath: string) {
  return join(CACHE_ROOT, flatten(abspath))
}

export function snapshotPath(abspath: string) {
  return join(snapshotDir(abspath), "cache.json")
}

export function hashOutput(output: string) {
  return createHash("sha1").update(output).digest("hex").slice(0, 12)
}

export function picturePath(abspath: string, name: string, output: string) {
  return join(snapshotDir(abspath), `${name}.${hashOutput(output)}.png`)
}

function readBaselineFile(file: string): BaselineFile | null {
  if (!existsSync(file)) return null
  try {
    return JSON.parse(readFileSync(file, "utf8")) as BaselineFile
  } catch {
    return null
  }
}

export function readBaseline(abspath: string): Record<string, string> {
  return readBaselineFile(snapshotPath(abspath))?.items ?? {}
}

/* skips the write when nothing changed */
export function writeBaseline(abspath: string, items: Record<string, string>) {
  const file = snapshotPath(abspath)
  const text = JSON.stringify({ source: abspath, items } satisfies BaselineFile, null, 2)
  if (existsSync(file) && readFileSync(file, "utf8") === text) return
  mkdirSync(snapshotDir(abspath), { recursive: true })
  writeFileSync(file, text)
}

/* deletes every picture in the file's dir not in `keep`; returns what was removed */
export function prunePictures(abspath: string, keep: Set<string>): string[] {
  const dir = snapshotDir(abspath)
  if (!existsSync(dir)) return []
  const removed: string[] = []
  for (const file of readdirSync(dir)) {
    const path = join(dir, file)
    if (!file.endsWith(".png") || keep.has(path)) continue
    rmSync(path, { force: true })
    removed.push(path)
  }
  return removed
}

/* removes dirs whose examples file no longer exists; returns the removed dirs */
export function cleanSnapshots(): string[] {
  if (!existsSync(CACHE_ROOT)) return []
  const removed: string[] = []
  for (const name of readdirSync(CACHE_ROOT)) {
    const dir = join(CACHE_ROOT, name)
    const baseline = readBaselineFile(join(dir, "cache.json"))
    if (baseline && existsSync(baseline.source)) continue
    rmSync(dir, { recursive: true, force: true })
    removed.push(dir)
  }
  return removed
}

/* absolute paths of the examples files that have a baseline and still exist */
export function snapshotSources(): string[] {
  if (!existsSync(CACHE_ROOT)) return []
  const sources: string[] = []
  for (const name of readdirSync(CACHE_ROOT)) {
    const baseline = readBaselineFile(join(CACHE_ROOT, name, "cache.json"))
    if (baseline && existsSync(baseline.source)) sources.push(baseline.source)
  }
  return sources.sort()
}
