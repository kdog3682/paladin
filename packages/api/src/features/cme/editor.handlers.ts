// @paladin/api/features/cme/editor.handlers.ts

import {
  createDoc,
  getDoc,
  updateDoc,
  listProjects,
  listRecentDocs,
  createNote,
  listNotesForDoc,
  flushDirty,
} from '../../cme/docStore'
import { commitProject } from '../../cme/git'
import { getConfig, setConfig } from '../../cme/config'

export const handlers = {
  'doc.currentOrCreate': () => createDoc({}).id,
  'doc.open': ({ id }: { id: string }) => getDoc(id),
  'doc.create': ({ input }: { input?: any }) => createDoc(input ?? {}).id,
  'doc.save': ({ id, editorState }: { id: string; editorState: any }) => {
    updateDoc(id, { editorState })
    return { ok: true }
  },
  'doc.setTitle': ({ id, title }: { id: string; title: string }) => updateDoc(id, { title }),
  'doc.setProject': ({ id, project }: { id: string; project: string }) => updateDoc(id, { project }),
  'doc.move': ({ id, dest }: { id: string; dest: string }) => updateDoc(id, { project: dest }),
  'doc.currentParent': () => 'scratchpad',
  'doc.compileExport': ({ id }: { id: string }) => ({ ok: true, path: `/tmp/${getDoc(id).id}.pdf` }),
  'doc.print': ({ id }: { id: string }) => {
    getDoc(id)
    return { ok: true }
  },
  'documents.list': () => listRecentDocs(10),
  'project.list': () => listProjects(),
  'note.create': ({ docId, text }: { docId: string; text: string }) => createNote(docId, text),
  'note.list': ({ docId }: { docId: string }) => listNotesForDoc(docId),
  'git.commit': ({ project, message }: { project: string; message?: string }) =>
    commitProject(project, message || '.'),
  'system.flush': () => flushDirty(),
  'config.get': () => getConfig(),
  'config.set': ({ key, value }: { key: string; value: any }) => setConfig({ [key]: value } as any),
}
