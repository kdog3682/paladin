// @paladin/packages/codeform/cache.ts

import { stat, readFile, writeFile, mkdir } from "fs/promises"
import { dirname, join } from "path"

type Entry<T> = {
  modifiedAt: number
  data: T
}

type Store<T> = Record<string, Entry<T>>

export class FileCache<T> {
  private store: Store<T> = {}
  private path: string
  private dirty = false

  constructor(path: string) {
    this.path = path
  }

  async load() {
    const raw = await readFile(this.path, "utf-8").catch(() => null)
    if (raw) this.store = JSON.parse(raw)
  }

  async save() {
    if (!this.dirty) return
    await mkdir(dirname(this.path), { recursive: true })
    await writeFile(this.path, JSON.stringify(this.store, null, 2))
    this.dirty = false
  }

  async get(filepath: string): Promise<T | null> {
    const entry = this.store[filepath]
    if (!entry) return null
    const info = await stat(filepath).catch(() => null)
    if (!info) return null
    if (info.mtimeMs > entry.modifiedAt) return null
    return entry.data
  }

  set(filepath: string, modifiedAt: number, data: T) {
    this.store[filepath] = { modifiedAt, data }
    this.dirty = true
  }

  delete(filepath: string) {
    delete this.store[filepath]
    this.dirty = true
  }

  clear() {
    this.store = {}
    this.dirty = true
  }

  keys(): string[] {
    return Object.keys(this.store)
  }
}
