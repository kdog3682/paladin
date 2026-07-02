import { mkdir, writeFile } from 'fs/promises'
import { documentPath, documentsDir } from './paths'

export interface DocRecord {
  id: string
  project: string
  title: string
  content: string
  editorState: unknown | null
  createdAt: number
  modifiedAt: number
}

export interface NoteRecord {
  id: string
  docId: string
  text: string
  createdAt: number
}

interface DocEntry {
  doc: DocRecord
  dirty: boolean
}

const docs = new Map<string, DocEntry>()
const notes = new Map<string, NoteRecord>()

export function createDoc(input: { project?: string; title?: string }): DocRecord {
  const now = Date.now()
  const doc: DocRecord = {
    id: crypto.randomUUID(),
    project: input.project ?? 'scratchpad',
    title: input.title ?? 'untitled', // frontend decides on a friendlier scratchpad name; not this layer's job
    content: '',
    editorState: null,
    createdAt: now,
    modifiedAt: now,
  }
  docs.set(doc.id, { doc, dirty: true })
  return doc
}

export function getDoc(id: string): DocRecord {
  const entry = docs.get(id)
  if (!entry) throw new Error(`doc not found: ${id}`)
  return entry.doc
}

export function updateDoc(
  id: string,
  patch: Partial<Pick<DocRecord, 'title' | 'project' | 'content' | 'editorState'>>
): DocRecord {
  const entry = docs.get(id)
  if (!entry) throw new Error(`doc not found: ${id}`)
  Object.assign(entry.doc, patch, { modifiedAt: Date.now() })
  entry.dirty = true
  return entry.doc
}

export function listProjects(): string[] {
  return [...new Set([...docs.values()].map((e) => e.doc.project))]
}

// most-recently-modified docs, for the omni panel's "recent" view
export function listRecentDocs(limit = 10): DocRecord[] {
  return [...docs.values()]
    .map((e) => e.doc)
    .sort((a, b) => b.modifiedAt - a.modifiedAt)
    .slice(0, limit)
}

export function createNote(docId: string, text: string): NoteRecord {
  getDoc(docId) // throws if missing
  const note: NoteRecord = { id: crypto.randomUUID(), docId, text, createdAt: Date.now() }
  notes.set(note.id, note)
  return note
}

export function listNotesForDoc(docId: string): NoteRecord[] {
  return [...notes.values()]
    .filter((n) => n.docId === docId)
    .sort((a, b) => b.createdAt - a.createdAt)
}

// writes only dirty docs to disk; a no-op for anything already flushed
export async function flushDirty(): Promise<string[]> {
  const written: string[] = []
  for (const entry of docs.values()) {
    if (!entry.dirty) continue
    await mkdir(documentsDir(entry.doc.project), { recursive: true })
    const path = documentPath(entry.doc.project, entry.doc.id)
    await writeFile(path, JSON.stringify(entry.doc, null, 2), 'utf-8')
    entry.dirty = false
    written.push(path)
  }
  return written
}

// stub: on boot, walk userProjectsDir()/*/documents/*.json and populate `docs`
export async function hydrateFromDisk(): Promise<void> {}
