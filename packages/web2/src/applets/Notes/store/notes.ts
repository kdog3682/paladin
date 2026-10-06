import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useShallow } from 'zustand/react/shallow'
import { isVisible, newNote, type Note, type NoteStatus, type NewNoteOpts } from '../lib/note'

export const BOOKMARK_SLOTS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'] as const
export type BookmarkSlot = (typeof BOOKMARK_SLOTS)[number]

export type NotesState = {
  /* every note ever made, in creation order, including archived and deleted ones */
  notes: Note[]
  activeId: string
  /* slot -> note id. setting an occupied slot overwrites it */
  bookmarks: Partial<Record<BookmarkSlot, string>>
  create: (opts?: NewNoteOpts) => string
  setContent: (id: string, content: string) => void
  setTitle: (id: string, title: string) => void
  setStatus: (id: string, status: NoteStatus) => void
  setKind: (id: string, kind: string) => void
  setActive: (id: string) => void
  /* move up (-1) or down (1) the visible list, without wrapping */
  step: (dir: 1 | -1) => void
  bookmark: (slot: BookmarkSlot, id?: string) => void
  jump: (slot: BookmarkSlot) => boolean
  /* merge notes (and bookmarks) from an export; per id, the newer updatedAt wins. returns how many notes were added or updated */
  importNotes: (data: unknown) => number
  /* guarantees at least one active note and a valid activeId */
  ensure: () => void
}

const touch = (note: Note, patch: Partial<Note>): Note => ({
  ...note,
  ...patch,
  updatedAt: new Date().toISOString(),
})

/* an export is { notes, bookmarks }; a bare array of notes is accepted too */
export const parseNotesExport = (data: unknown): { notes: Note[]; bookmarks: NotesState['bookmarks'] } => {
  const raw = Array.isArray(data) ? { notes: data } : (data as { notes?: unknown; bookmarks?: unknown })
  if (!raw || !Array.isArray(raw.notes)) throw new Error('not a notes export')
  const now = new Date().toISOString()
  const notes = raw.notes
    .filter((n): n is Partial<Note> => !!n && typeof n === 'object' && typeof (n as Note).id === 'string')
    .map(n => ({
      ...newNote(),
      createdAt: now,
      updatedAt: now,
      ...n,
      content: typeof n.content === 'string' ? n.content : '',
    }))
  const bookmarks = (raw as { bookmarks?: NotesState['bookmarks'] }).bookmarks ?? {}
  return { notes, bookmarks }
}

const first = newNote()

export const useNotes = create<NotesState>()(
  persist(
    (set, get) => ({
      notes: [first],
      activeId: first.id,
      bookmarks: {},

      create: opts => {
        const note = newNote(opts)
        set(s => ({ notes: [...s.notes, note], activeId: note.id }))
        return note.id
      },

      setContent: (id, content) =>
        set(s => {
          const note = s.notes.find(n => n.id === id)
          if (!note || note.content === content) return s
          return { notes: s.notes.map(n => (n.id === id ? touch(n, { content }) : n)) }
        }),

      setTitle: (id, title) =>
        set(s => ({ notes: s.notes.map(n => (n.id === id ? touch(n, { title }) : n)) })),

      setStatus: (id, status) =>
        set(s => {
          const notes = s.notes.map(n => (n.id === id ? touch(n, { status }) : n))
          if (id !== s.activeId || status === 'active') return { notes }
          // the active note left the sidebar: land on its nearest neighbour
          const idx = s.notes.filter(isVisible).findIndex(n => n.id === id)
          const visible = notes.filter(isVisible)
          return { notes, activeId: visible[Math.min(idx, visible.length - 1)]?.id ?? '' }
        }),

      setKind: (id, kind) =>
        set(s => ({ notes: s.notes.map(n => (n.id === id ? touch(n, { kind }) : n)) })),

      setActive: id => set({ activeId: id }),

      step: dir => {
        const s = get()
        const visible = s.notes.filter(isVisible)
        const next = visible[visible.findIndex(n => n.id === s.activeId) + dir]
        if (next) set({ activeId: next.id })
      },

      bookmark: (slot, id) => {
        const target = id ?? get().activeId
        if (!target) return
        set(s => ({ bookmarks: { ...s.bookmarks, [slot]: target } }))
      },

      jump: slot => {
        const s = get()
        const id = s.bookmarks[slot]
        const note = s.notes.find(n => n.id === id && n.status !== 'deleted')
        if (!note) return false
        // a bookmarked note that was archived comes back to the sidebar
        set({
          activeId: note.id,
          notes: isVisible(note)
            ? s.notes
            : s.notes.map(n => (n.id === note.id ? touch(n, { status: 'active' }) : n)),
        })
        return true
      },

      importNotes: data => {
        const incoming = parseNotesExport(data)
        let changed = 0
        set(s => {
          const byId = new Map(s.notes.map(n => [n.id, n]))
          for (const n of incoming.notes) {
            const cur = byId.get(n.id)
            if (cur && cur.updatedAt >= n.updatedAt) continue
            byId.set(n.id, n)
            changed++
          }
          return { notes: [...byId.values()], bookmarks: { ...incoming.bookmarks, ...s.bookmarks } }
        })
        get().ensure()
        return changed
      },

      ensure: () =>
        set(s => {
          const notes = s.notes.filter(isVisible).length ? s.notes : [...s.notes, newNote()]
          const visible = notes.filter(isVisible)
          const active = visible.find(n => n.id === s.activeId) ?? visible[0]
          return { notes, activeId: active?.id ?? '' }
        }),
    }),
    {
      name: 'paladin.notes.v1',
      version: 1,
      partialize: s => ({ notes: s.notes, activeId: s.activeId, bookmarks: s.bookmarks }),
    },
  ),
)

export const useVisibleNotes = () => useNotes(useShallow(s => s.notes.filter(isVisible)))

export const useSearchableNotes = () =>
  useNotes(useShallow(s => s.notes.filter(n => n.status !== 'deleted')))

export const useNote = (id: string) => useNotes(s => s.notes.find(n => n.id === id))

export const useActiveNote = () => useNotes(s => s.notes.find(n => n.id === s.activeId))

/* the slot a note is bookmarked in, if any */
export const useBookmarkSlot = (id: string) =>
  useNotes(s => BOOKMARK_SLOTS.find(slot => s.bookmarks[slot] === id))
