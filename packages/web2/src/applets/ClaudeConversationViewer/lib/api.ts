/* mirrors packages/api2/src/routes/conversations.ts */
export type ImageBlock = { type: "image"; mediaType: string; bytes: number; src: string }
export type TextBlock = { type: "text"; text: string }
export type ThinkingBlock = { type: "thinking"; text: string }
export type ToolUseBlock = { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
export type ToolResultBlock = {
  type: "tool_result"
  toolUseId: string
  isError: boolean
  content: (TextBlock | ImageBlock)[]
}
export type Block = TextBlock | ThinkingBlock | ToolUseBlock | ToolResultBlock | ImageBlock

export type Turn = {
  uuid: string
  role: "user" | "assistant"
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

export type Session = { project: string; id: string; title?: string; turns: Turn[] }

const get = async <T,>(url: string): Promise<T> => {
  const res = await fetch(url)
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error ?? `${res.status} ${url}`)
  return body
}

export const listSessions = () => get<SessionInfo[]>("/api/conversations")
export const loadSession = (project: string, id: string) =>
  get<Session>(`/api/conversations/session/${project}/${id}`)
