import type { Meta, Story as StoryDef } from "../types"

/** one stories file as the generated `virtual:storylite/stories` module lists it */
export type Entry = {
  file: string
  title: string
  /** export names in the order they were written */
  order: string[]
  load: () => Promise<Record<string, unknown>>
}

export type Story = {
  /** `<file>::<export>` */
  id: string
  file: string
  title: string
  name: string
  meta: Meta
  def: StoryDef
}

export type Group = {
  file: string
  title: string
  stories: Story[]
  /** the file failed to import, so there are no stories to list */
  error?: string
}

/** `withIcon` / `with_icon` -> `With Icon` */
export function humanize(name: string) {
  const spaced = name.replace(/_/g, " ").replace(/([a-z0-9])([A-Z])/g, "$1 $2")
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

const isStory = (v: unknown): v is StoryDef | (() => unknown) => typeof v === "function" || (typeof v === "object" && v !== null)

/** import every stories file. one that throws on import is listed with its error rather than sinking the page */
export async function loadGroups(entries: Entry[]): Promise<Group[]> {
  return Promise.all(
    entries.map(async ({ file, title, order, load }): Promise<Group> => {
      try {
        const mod = await load()
        const meta = (mod.default ?? {}) as Meta
        const groupTitle = meta.title ?? title
        const keys = [...new Set([...order, ...Object.keys(mod)])].filter((k) => k !== "default" && k in mod && isStory(mod[k]))
        const stories = keys.map((key): Story => {
          const raw = mod[key] as StoryDef | (() => unknown)
          // a bare function is the shorthand for a story that is only a render
          const def: StoryDef = typeof raw === "function" ? { render: raw as StoryDef["render"] } : raw
          return { id: `${file}::${key}`, file, title: groupTitle, name: def.name ?? humanize(key), meta, def }
        })
        return { file, title: groupTitle, stories }
      } catch (err) {
        return { file, title, stories: [], error: err instanceof Error ? (err.stack ?? err.message) : String(err) }
      }
    }),
  )
}
