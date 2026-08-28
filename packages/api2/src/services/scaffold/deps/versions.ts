import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { expandHome } from "@paladin/utils"

export const DEFAULT_CACHE_PATH = join(expandHome("~/projects/paladin"), "npm-dependencies.json")

/**
 * Latest-version lookups, memoised on disk. Anything newly fetched shows up in
 * `learned` so the caller can emit a merge op for the cache file rather than
 * writing it behind everyone's back.
 */
export class VersionCache {
  readonly path: string
  private known: Record<string, string>
  private fetched: Record<string, string> = {}

  constructor(path: string = DEFAULT_CACHE_PATH) {
    this.path = path
    this.known = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {}
  }

  get learned(): Record<string, string> {
    return this.fetched
  }

  async spec(name: string): Promise<string> {
    const cached = this.known[name] ?? this.fetched[name]
    if (cached) return cached

    const res = await fetch(`https://registry.npmjs.org/${name}/latest`)
    const data = (await res.json()) as { version?: string }
    if (!data.version) throw new Error(`scaffold: no version found for "${name}"`)

    const spec = `^${data.version}`
    this.fetched[name] = spec
    return spec
  }
}
