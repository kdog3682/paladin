export interface TextContent {
  type: "text"
  text: string
  start_timestamp?: string
  stop_timestamp?: string
  citations?: unknown[]
}

export interface ToolUseContent {
  type: "tool_use"
  id: string
  name: string
  input: Record<string, unknown>
  message?: string
  icon_name?: string
  start_timestamp?: string
  stop_timestamp?: string
}

export interface ToolResultContent {
  type: "tool_result"
  tool_use_id: string
  name: string
  content: Array<{ type: string; text: string; uuid?: string }>
  is_error?: boolean
  icon_name?: string
}

export type MessageContent =
  | TextContent
  | ToolUseContent
  | ToolResultContent

export interface ArtifactInput {
  id: string
  type: string
  title: string
  command: "create" | "update" | "rewrite"
  content?: string
  old_str?: string
  new_str?: string
  language?: string
  version_uuid?: string
}

export interface Message {
  uuid: string
  text: string
  content: MessageContent[]
  sender: "human" | "assistant"
  index: number
  created_at: string
  updated_at: string
  truncated: boolean
  stop_reason?: string
  attachments: unknown[]
  files: unknown[]
  sync_sources: unknown[]
  parent_message_uuid: string
  nOptions: number
  selectedOption: number
}

export interface Conversation {
  url: string
  title: string
  updatedAt: string
  messages: Message[]
}
