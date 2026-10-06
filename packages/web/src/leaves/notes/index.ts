import type { Leaf } from "../../core/leaf"
import { defineText } from "../../core/palette/define"

export type NoteMeta = {
  projectId: string
  sessionId: string
}

export type NotesStore = {
  add: (text: string, meta: NoteMeta) => Promise<void>
}

/* "note <text>" captures a note inline from the palette */
export function noteLeaf(notes: NotesStore): Leaf {
  return {
    id: "notes",
    commands: [
      defineText({
        id: "notes.add",
        title: "Note",
        keywords: ["note", "add note", "jot"],
        group: "Notes",
        placeholder: "Write a note…",
        validate: (text) => (text.trim() ? undefined : "The note is empty"),
        run: async (text, ctx) => {
          await notes.add(text.trim(), { projectId: ctx.projectId, sessionId: ctx.sessionId })
          return { focus: "restore" }
        },
      }),
    ],
  }
}

/* in-memory notes until the notes backend exists */
export function createMemoryNotes(): NotesStore & { list: () => { text: string; meta: NoteMeta }[] } {
  const items: { text: string; meta: NoteMeta }[] = []
  return {
    add: async (text, meta) => {
      items.push({ text, meta })
    },
    list: () => items,
  }
}
