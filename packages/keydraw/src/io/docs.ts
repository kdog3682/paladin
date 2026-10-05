/* the document library: the open doc lives in the store, other docs are snapshots in the storage adapter (§16) */
import type { StorageAdapter } from "../storage/adapter"
import { hybridAdapter } from "../storage/idbAdapter"
import { localAdapter } from "../storage/localAdapter"

const storage = hybridAdapter(localAdapter)
import { newDoc } from "../model/tree"
import type { Doc } from "../model/types"
import { S, useEditor } from "../store/useEditor"
import { builtinDefaults } from "../store/slices/defaults"

const PREFIX = "keydraw:doc:"

/* per-document state: the doc, its undo/redo stack, focus, selection and viewport */
type Snapshot = Pick<ReturnType<typeof S>, "doc" | "past" | "future" | "focus" | "lastVisited" | "selected" | "selStack" | "viewport">

function snapshot(): Snapshot {
  const { doc, past, future, focus, lastVisited, selected, selStack, viewport } = S()
  return { doc, past, future, focus, lastVisited, selected, selStack, viewport }
}

export async function saveOpenDoc(adapter: StorageAdapter = storage): Promise<void> {
  await adapter.save(PREFIX + S().doc.id, JSON.stringify(snapshot()))
}

export async function listDocs(adapter: StorageAdapter = storage): Promise<{ id: string, title: string }[]> {
  const out: { id: string, title: string }[] = []
  for (const key of await adapter.list(PREFIX)) {
    const raw = await adapter.load(key)
    if (!raw) continue
    try {
      const { doc } = JSON.parse(raw) as { doc: Doc }
      out.push({ id: doc.id, title: doc.title })
    } catch {
      /* skip unreadable entries */
    }
  }
  const open = S().doc
  if (!out.some(d => d.id === open.id)) out.push({ id: open.id, title: open.title })
  return out
}

function install(snap: Partial<Snapshot>) {
  useEditor.setState({
    selected: [],
    selStack: [],
    draft: null,
    lastChange: null,
    mode: "normal",
    ...snap,
  })
  S().repairFocus()
}

/* saves the open doc, then starts a fresh untitled one (named with its timestamp) */
export async function newDocument(adapter: StorageAdapter = storage): Promise<void> {
  await saveOpenDoc(adapter)
  const doc = newDoc(builtinDefaults.nodes.artboard)
  install({ doc, past: [], future: [], focus: doc.boards[doc.currentBoard].root, lastVisited: {}, viewport: { x: 0, y: 0, zoom: 1, fitted: false } })
}

/* opens a doc by id or by title (exact, then prefix, case-insensitive); returns its title */
export async function openDocument(query: string, adapter: StorageAdapter = storage): Promise<string | null> {
  const q = query.trim().toLowerCase()
  const docs = await listDocs(adapter)
  const hit = docs.find(d => d.id === query || d.title.toLowerCase() === q) ?? docs.find(d => d.title.toLowerCase().startsWith(q))
  if (!hit) return null
  if (hit.id === S().doc.id) return hit.title
  await saveOpenDoc(adapter)
  const raw = await adapter.load(PREFIX + hit.id)
  if (!raw) return null
  install(JSON.parse(raw) as Snapshot)
  return hit.title
}

export function renameDocument(title: string): void {
  S().setDoc(d => {
    d.title = title
  })
}
