import { mkdir, readdir, readFile, writeFile, rm } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

const ROOT = join(homedir(), '.paladin', 'user', 'documents', 'cme')
const META = join(ROOT, '.paladin')
const PROJECT = join(META, 'project.json')

interface DocRecord {
  id: string
  title: string
  createdAt: number
  modifiedAt: number
  deletedAt?: number
  content: string
  cm: unknown // serialized EditorState json incl foldState
  scrollTop: number
}

interface AppRecord {
  tabs: string[]
  activeId: string
}

/** In-memory source of truth for the cme package; flushed to disk on interval. */
export class ProjectState {
  docs = new Map<string, DocRecord>()
  app: AppRecord = { tabs: [], activeId: '' }

  private dirtyDocs = new Set<string>()
  private appDirty = false
  private timer: ReturnType<typeof setInterval> | null = null
  private loaded = false

  async load() {
    if (this.loaded) return
    await mkdir(META, { recursive: true })

    const entries = await readdir(META).catch(() => [] as string[])
    for (const f of entries) {
      if (!f.endsWith('.json') || f === 'project.json') continue
      try {
        const rec = JSON.parse(await readFile(join(META, f), 'utf8')) as DocRecord
        this.docs.set(rec.id, rec)
      } catch {
        /* skip corrupt record */
      }
    }

    try {
      this.app = JSON.parse(await readFile(PROJECT, 'utf8')) as AppRecord
    } catch {
      this.app = { tabs: [], activeId: '' }
    }

    this.loaded = true
  }

  upsertDoc(p: {
    id: string
    title: string
    content: string
    cm: unknown
    scrollTop?: number
  }) {
    const now = Date.now()
    const prev = this.docs.get(p.id)
    this.docs.set(p.id, {
      id: p.id,
      title: p.title,
      createdAt: prev?.createdAt ?? now,
      modifiedAt: now,
      content: p.content,
      cm: p.cm,
      scrollTop: p.scrollTop ?? 0,
    })
    this.dirtyDocs.add(p.id)
  }

  deleteDoc(id: string) {
    const rec = this.docs.get(id)
    if (!rec) return
    rec.deletedAt = Date.now()
    this.dirtyDocs.add(id)
  }

  setApp(app: AppRecord) {
    this.app = app
    this.appDirty = true
  }

  /** Hydration payload for the client (live docs only). */
  snapshot() {
    const docs = [...this.docs.values()]
      .filter((d) => !d.deletedAt)
      .map((d) => ({ id: d.id, title: d.title, cm: d.cm, scrollTop: d.scrollTop }))
    return { docs, tabs: this.app.tabs, activeId: this.app.activeId }
  }

  async flush() {
    if (this.dirtyDocs.size) {
      await mkdir(META, { recursive: true })
      for (const id of this.dirtyDocs) {
        const rec = this.docs.get(id)
        if (!rec) continue
        const txt = join(ROOT, `${id}.txt`)
        const meta = join(META, `${id}.json`)
        if (rec.deletedAt) {
          await rm(txt, { force: true })
          await writeFile(meta, JSON.stringify(rec))
        } else {
          await writeFile(txt, rec.content)
          await writeFile(meta, JSON.stringify(rec))
        }
      }
      this.dirtyDocs.clear()
    }
    if (this.appDirty) {
      await mkdir(META, { recursive: true })
      await writeFile(PROJECT, JSON.stringify(this.app))
      this.appDirty = false
    }
  }

  start(intervalMs = 5000) {
    if (this.timer) return
    this.timer = setInterval(() => {
      this.flush().catch(() => {})
    }, intervalMs)
  }
}

export const project = new ProjectState()

// self-init on import: load from disk, then begin periodic flushing.
export const whenReady = project.load().then(() => project.start())
