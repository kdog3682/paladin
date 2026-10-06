import {readdir, readFile, stat} from 'node:fs/promises'
import {homedir} from 'node:os'
import {join} from 'node:path'
import {createRouter, fail} from './base'

/* read-only view of claude code transcripts (~/.claude/projects/<project>/<session>.jsonl) */
const ROOT = join(homedir(), '.claude', 'projects')

export type ImageBlock = {type: 'image'; mediaType: string; bytes: number; src: string}
export type TextBlock = {type: 'text'; text: string}
export type ThinkingBlock = {type: 'thinking'; text: string}
export type ToolUseBlock = {type: 'tool_use'; id: string; name: string; input: Record<string, unknown>}
export type ToolResultBlock = {
  type: 'tool_result'
  toolUseId: string
  isError: boolean
  content: (TextBlock | ImageBlock)[]
}
export type Block = TextBlock | ThinkingBlock | ToolUseBlock | ToolResultBlock | ImageBlock

export type Turn = {
  uuid: string
  role: 'user' | 'assistant'
  timestamp?: string
  sidechain: boolean
  blocks: Block[]
}

export type SessionInfo = {
  project: string
  id: string
  title?: string
  firstPrompt?: string
  modified: number
  size: number
}

/* ids end up in file paths */
const safe = (part: string) => {
  if (!/^[\w.-]+$/.test(part) || part.startsWith('.')) fail(400, `bad id: ${part}`)
  return part
}

const file = (project: string, id: string) => join(ROOT, safe(project), `${safe(id)}.jsonl`)

const parseLines = (raw: string) => {
  const lines: any[] = []
  for (const line of raw.split('\n')) {
    if (!line) continue
    try {
      lines.push(JSON.parse(line))
    } catch {
      lines.push(null)
    }
  }
  return lines
}

const imageSrc = (project: string, id: string, line: number, path: number[]) =>
  `/api/conversations/image/${project}/${id}/${line}/${path.join('.')}`

const toImage = (b: any, src: string): ImageBlock => ({
  type: 'image',
  mediaType: b.source?.media_type ?? 'image/png',
  bytes: Math.floor(((b.source?.data?.length ?? 0) * 3) / 4),
  src,
})

/* tool results are a string, or a list of text and image blocks */
const toResultContent = (content: any, src: (i: number) => string) => {
  if (typeof content === 'string') return [{type: 'text', text: content} as TextBlock]
  if (!Array.isArray(content)) return []
  return content.flatMap((b, i): (TextBlock | ImageBlock)[] => {
    if (b.type === 'image') return [toImage(b, src(i))]
    if (b.type === 'text') return [{type: 'text', text: b.text}]
    return []
  })
}

/* the harness wraps slash commands and their output in tags, and prepends a caveat about them */
const cleanUserText = (text: string) => {
  const name = text.match(/<command-name>\s*(.*?)\s*<\/command-name>/s)?.[1]
  const args = text.match(/<command-args>(.*?)<\/command-args>/s)?.[1]?.trim()
  if (name) return name === '/clear' ? '' : [name, args].filter(Boolean).join(' ')
  return text
    .replace(/<local-command-caveat>.*?<\/local-command-caveat>/gs, '')
    .replace(/<local-command-stdout>.*?<\/local-command-stdout>/gs, '')
    .trim()
}

const toBlocks = (content: any, project: string, id: string, line: number, role: Turn['role']): Block[] => {
  if (typeof content === 'string') {
    const text = role === 'user' ? cleanUserText(content) : content
    return text ? [{type: 'text', text}] : []
  }
  if (!Array.isArray(content)) return []
  return content.flatMap((b, i): Block[] => {
    switch (b.type) {
      case 'text': {
        const text = role === 'user' ? cleanUserText(b.text) : b.text
        return text ? [{type: 'text', text}] : []
      }
      case 'thinking':
        // the text is usually redacted down to a signature
        return b.thinking ? [{type: 'thinking', text: b.thinking}] : []
      case 'tool_use':
        return [{type: 'tool_use', id: b.id, name: b.name, input: b.input ?? {}}]
      case 'image':
        return [toImage(b, imageSrc(project, id, line, [i]))]
      case 'tool_result':
        return [
          {
            type: 'tool_result',
            toolUseId: b.tool_use_id,
            isError: !!b.is_error,
            content: toResultContent(b.content, j => imageSrc(project, id, line, [i, j])),
          },
        ]
      default:
        return []
    }
  })
}

const toTurns = (lines: any[], project: string, id: string): Turn[] =>
  lines.flatMap((d, line): Turn[] => {
    if (!d || (d.type !== 'user' && d.type !== 'assistant') || !d.message) return []
    const blocks = toBlocks(d.message.content, project, id, line, d.type)
    if (!blocks.length) return []
    return [{uuid: d.uuid ?? String(line), role: d.type, timestamp: d.timestamp, sidechain: !!d.isSidechain, blocks}]
  })

/* first real user prompt, skipping caveats, slash commands and tool results */
const firstPrompt = (turns: Turn[]) => {
  for (const t of turns) {
    if (t.role !== 'user') continue
    for (const b of t.blocks) {
      if (b.type === 'text' && !b.text.trimStart().startsWith('<')) return b.text.slice(0, 200)
    }
  }
}

const describe = async (project: string, name: string): Promise<SessionInfo | undefined> => {
  const path = join(ROOT, project, name)
  const id = name.replace(/\.jsonl$/, '')
  const info = await stat(path).catch(() => null)
  if (!info) return
  const lines = parseLines(await readFile(path, 'utf8'))
  const title = [...lines].reverse().find(d => d?.type === 'ai-title')?.aiTitle
  return {project, id, title, firstPrompt: firstPrompt(toTurns(lines, project, id)), modified: info.mtimeMs, size: info.size}
}

const app = createRouter()

/* newest first. ?project= narrows to one project dir */
app.get('/', async ({project}: {project?: string}) => {
  const projects = project ? [safe(project)] : await readdir(ROOT).catch(() => [])
  const sessions = await Promise.all(
    projects.map(async p => {
      const names = (await readdir(join(ROOT, p)).catch(() => [])).filter(n => n.endsWith('.jsonl'))
      return Promise.all(names.map(n => describe(p, n)))
    }),
  )
  return sessions
    .flat()
    .filter((s): s is SessionInfo => !!s)
    .sort((a, b) => b.modified - a.modified)
})

app.get('/session/:project/:id', async ({project, id}) => {
  const raw = await readFile(file(project, id), 'utf8').catch(() => null)
  if (raw === null) fail(404, `no such session: ${project}/${id}`)
  const lines = parseLines(raw!)
  const title = [...lines].reverse().find(d => d?.type === 'ai-title')?.aiTitle
  return {project, id, title, turns: toTurns(lines, project, id)}
})

/* image bytes, kept out of the json. path is the index into content, or content then tool_result content */
app.hono.get('/image/:project/:id/:line/:path', async c => {
  const {project, id, line, path} = c.req.param()
  const raw = await readFile(file(project, id), 'utf8').catch(() => null)
  if (raw === null) return c.json({error: 'no such session'}, 404)
  const entry = parseLines(raw)[Number(line)]
  let node: any = entry?.message?.content
  for (const i of path.split('.')) {
    // a tool_result's children live under .content
    if (node?.type === 'tool_result') node = node.content
    node = node?.[Number(i)]
  }
  const data = node?.source?.data
  if (!data) return c.json({error: 'no such image'}, 404)
  return new Response(Buffer.from(data, 'base64'), {
    headers: {'Content-Type': node.source.media_type ?? 'image/png', 'Cache-Control': 'max-age=3600'},
  })
})

export default app
