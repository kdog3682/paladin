import { Hono } from 'hono'
import {
  createDoc,
  getDoc,
  updateDoc,
  listProjects,
  listRecentDocs,
  createNote,
  listNotesForDoc,
  flushDirty,
} from './docStore'
import { commitProject } from './git'
import { getConfig, setConfig } from './config'

export const cmeRoute = new Hono()

type Handler = (args: any[]) => Promise<unknown> | unknown

const handlers: Record<string, Handler> = {
  'doc.currentOrCreate': () => createDoc({}).id,
  'doc.open': ([id]) => getDoc(id),
  'doc.create': ([input]) => createDoc(input ?? {}).id,
  'doc.save': ([id, editorState]) => {
    updateDoc(id, { editorState })
    return { ok: true }
  },
  'doc.setTitle': ([id, title]) => updateDoc(id, { title }),
  'doc.setProject': ([id, project]) => updateDoc(id, { project }),
  'doc.move': ([id, dest]) => updateDoc(id, { project: dest }),
  'doc.currentParent': () => 'scratchpad', // stub: parent project of the doc last focused
  'doc.compileExport': ([id]) => ({ ok: true, path: `/tmp/${getDoc(id).id}.pdf` }),
  'doc.print': ([id]) => {
    getDoc(id)
    return { ok: true }
  },
  'documents.list': () => listRecentDocs(10), // sorted by mtime desc
  'project.list': () => listProjects(),
  'note.create': ([docId, text]) => createNote(docId, text),
  'note.list': ([docId]) => listNotesForDoc(docId),
  'git.commit': ([project, message]) => commitProject(project, message || '.'),
  'system.flush': () => flushDirty(),
  'config.get': () => getConfig(),
  'config.set': ([key, value]) => setConfig({ [key]: value } as any),
}

cmeRoute.post('/', async (c) => {
  const { method, args = [] } = await c.req.json()
  const handler = handlers[method]
  if (!handler) return c.text(`unknown method: ${method}`, 400)
  try {
    return c.json(await handler(args))
  } catch (err) {
    return c.text(err instanceof Error ? err.message : 'error', 500)
  }
})
