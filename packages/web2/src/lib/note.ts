export type ISODate = string

export const NOTE_STATUSES = ['active', 'archived', 'suspended', 'deleted'] as const
export type NoteStatus = (typeof NOTE_STATUSES)[number]

export type Note = {
  id: string
  /* only `active` notes appear in the sidebar */
  status: NoteStatus
  createdAt: ISODate
  updatedAt: ISODate
  content: string
  /* user-set name; notes from before this existed derive one from content */
  title?: string
  /* free-form label, eg 'note' | 'scratch' | 'todo' */
  kind: string
}

export type NewNoteOpts = {
  kind?: string
  content?: string
}

export const newNote = ({ kind = 'note', content = '' }: NewNoteOpts = {}): Note => {
  const now = new Date().toISOString()
  return { id: crypto.randomUUID(), status: 'active', createdAt: now, updatedAt: now, content, kind }
}

/* without a title, the first line that has anything on it stands in */
export const noteTitle = (note: Note, fallback = 'untitled') => {
  if (note.title?.trim()) return note.title.trim()
  const line = note.content.split('\n').find(l => l.trim().length > 0)
  if (!line) return fallback
  return line.replace(/^#+\s*/, '').trim().slice(0, 60)
}

/* a one-line preview of everything after the title */
export const noteSnippet = (note: Note, max = 80) => {
  const lines = note.content.split('\n')
  const start = note.title?.trim() ? -1 : lines.findIndex(l => l.trim().length > 0)
  const rest = lines.slice(start + 1).join(' ').replace(/\s+/g, ' ').trim()
  return rest.slice(0, max)
}

export const isVisible = (note: Note) => note.status === 'active'
