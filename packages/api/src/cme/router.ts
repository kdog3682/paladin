interface DocRecord {
  id: string
  project: string
  title: string
  content: string
  editorState: unknown | null
  parent: string | null
}

// in-memory for now — swap for real persistence later
const docs = new Map<string, DocRecord>()

function scratchpadTitle(): string {
  const d = new Date()
  const weekday = d.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase()
  const hour = d.getHours()
  const bin = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'
  return `${weekday}-${bin}`
}

function createDoc(input: { project?: string; title?: string; parent?: string | null }): DocRecord {
  const doc: DocRecord = {
    id: crypto.randomUUID(),
    project: input.project ?? 'scratchpad',
    title: input.title ?? scratchpadTitle(),
    content: '',
    editorState: null,
    parent: input.parent ?? null,
  }
  docs.set(doc.id, doc)
  return doc
}

function getDoc(id: string): DocRecord {
  const doc = docs.get(id)
  if (!doc) throw new Error(`doc not found: ${id}`)
  return doc
}

type Handler = (args: any[]) => Promise<unknown> | unknown

const handlers: Record<string, Handler> = {
  'doc.currentOrCreate': () => {
    // stub: real impl looks up the last-open doc for this session
    return createDoc({}).id
  },
  'doc.open': ([id]) => getDoc(id),
  'doc.create': ([input]) => createDoc(input ?? {}).id,
  'doc.save': ([id, editorState]) => {
    getDoc(id).editorState = editorState
    return { ok: true }
  },
  'doc.setTitle': ([id, title]) => {
    getDoc(id).title = title
    return { ok: true }
  },
  'doc.setProject': ([id, project]) => {
    getDoc(id).project = project
    return { ok: true }
  },
  'doc.move': ([id, dest]) => {
    getDoc(id).project = dest
    return { ok: true }
  },
  'doc.currentParent': () => {
    // stub: parent project of the doc last focused
    return 'scratchpad'
  },
  'doc.compileExport': ([id]) => {
    const doc = getDoc(id)
    return { ok: true, path: `/tmp/${doc.id}.pdf` }
  },
  'doc.print': ([id]) => {
    getDoc(id)
    return { ok: true }
  },
  'git.commit': ([message]) => ({ ok: true, message: message || '(no message)' }),
  'fzf.files': () => [],
  'project.list': () => [...new Set([...docs.values()].map((d) => d.project))],
}

export async function handleCmeRequest(req: Request): Promise<Response> {
  const { method, args = [] } = await req.json()
  const handler = handlers[method]
  if (!handler) return new Response(`unknown method: ${method}`, { status: 400 })
  try {
    return Response.json(await handler(args))
  } catch (err) {
    return new Response(err instanceof Error ? err.message : 'error', { status: 500 })
  }
}

// wiring:
// Bun.serve({
//   port: 3001,
//   fetch: (req) => {
//     const url = new URL(req.url)
//     if (url.pathname === '/api/cme' && req.method === 'POST') return handleCmeRequest(req)
//     return new Response('not found', { status: 404 })
//   },
// })
