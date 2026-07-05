import { project, whenReady } from './ProjectState'

export const handlers = {
  'state.load': async () => {
    await whenReady
    return project.snapshot()
  },

  'doc.upsert': (kwargs: {
    id: string
    title: string
    content: string
    cm: unknown
    scrollTop?: number
  }) => {
    project.upsertDoc(kwargs)
    return { ok: true }
  },

  'doc.delete': ({ id }: { id: string }) => {
    project.deleteDoc(id)
    return { ok: true }
  },

  'app.save': (app: { tabs: string[]; activeId: string }) => {
    project.setApp(app)
    return { ok: true }
  },
}
