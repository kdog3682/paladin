// @paladin/packages/api/src/services/filewatch/resolve-npm-version.ts

import { existsSync } from "fs"
import { readFile, writeFile, readdir, stat, mkdir } from "fs/promises"
import { dirname, join } from "path"
import { config } from "../../config"

type VersionMap = Record<string, string>

class NpmVersionResolver {
  private versions: VersionMap | null = null
  private dirty = false

  private async findMostRecentLockfile(): Promise<string | null> {
    const baseDir = config.baseProjectsDir
    if (!existsSync(baseDir)) return null

    let best: { path: string, mtime: number } | null = null
    const entries = await readdir(baseDir, { withFileTypes: true })

    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const lockPath = join(baseDir, entry.name, "bun.lock")
      if (!existsSync(lockPath)) continue
      const info = await stat(lockPath)
      if (!best || info.mtimeMs > best.mtime) {
        best = { path: lockPath, mtime: info.mtimeMs }
      }
    }

    return best?.path ?? null
  }

  private async buildFromLockfile(lockPath: string): Promise<VersionMap> {
    const raw = await readFile(lockPath, "utf-8")
    const lock = Bun.JSONC.parse(raw)
    const entries: Record<string, unknown[]> = lock.packages ?? {}
    const result: VersionMap = {}

    for (const key of Object.keys(entries)) {
      if (key.includes("workspace:")) continue
      const lastAt = key.lastIndexOf("@")
      if (lastAt <= 0) continue
      const name = key.slice(0, lastAt)
      const version = key.slice(lastAt + 1)
      if (name && version) result[name] = version
    }

    return result
  }

  private async fetchFromRegistry(pkg: string): Promise<string | null> {
    const res = await fetch(`https://registry.npmjs.org/${pkg}/latest`)
    if (!res.ok) return null
    const { version } = await res.json()
    return version ?? null
  }

  private async load(): Promise<void> {
    if (this.versions) return

    const cachePath = config.bunDepCacheDir

    if (existsSync(cachePath)) {
      const raw = await readFile(cachePath, "utf-8")
      this.versions = JSON.parse(raw)
      return
    }

    const lockPath = await this.findMostRecentLockfile()
    if (lockPath) {
      this.versions = await this.buildFromLockfile(lockPath)
      this.dirty = Object.keys(this.versions).length > 0
    } else {
      this.versions = {}
    }
  }

  async resolve(pkg: string): Promise<string> {
    await this.load()

    if (this.versions![pkg]) return `^${this.versions![pkg]}`

    const version = await this.fetchFromRegistry(pkg)
    if (version) {
      this.versions![pkg] = version
      this.dirty = true
      return `^${version}`
    }

    return "latest"
  }

  async flush(): Promise<void> {
    if (!this.dirty || !this.versions) return
    const cachePath = config.bunDepCacheDir
    await mkdir(dirname(cachePath), { recursive: true })
    await writeFile(cachePath, JSON.stringify(this.versions, null, 2))
    this.dirty = false
  }
}

const resolver = new NpmVersionResolver()

export const resolveVersion = (pkg: string) => resolver.resolve(pkg)
export const flushVersionCache = () => resolver.flush()
