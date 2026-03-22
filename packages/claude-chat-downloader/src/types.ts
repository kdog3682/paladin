/* ============================
 * Core literals
 * ============================ */

type Sender = 'human' | 'assistant';

type ToolName =
  | 'artifacts'
  | 'web_fetch';

/* ============================
 * Text content
 * ============================ */

interface TextContent {
  type: 'text';
  text: string;
  citations: unknown[];
  start_timestamp?: string;
  stop_timestamp?: string;
}

/* ============================
 * Tool use
 * ============================ */

interface ToolUseContent {
  type: 'tool_use';
  name: ToolName;
  input: Record<string, unknown>;
  message?: string;
  start_timestamp?: string;
  stop_timestamp?: string;
}

/* ============================
 * Artifact tool result
 * ============================ */

interface ArtifactResultItem {
  type: 'text';
  text: 'OK'; // observed literal
  uuid: string;
}

interface ArtifactToolResult {
  type: 'tool_result';
  name: 'artifacts';
  content: ArtifactResultItem[];
  is_error: false;
}

/* ============================
 * Web fetch tool result
 * ============================ */

interface WebFetchMetadata {
  type: 'webpage_metadata';
  site_domain: string;
  favicon_url: string;
  site_name: string;
}

interface WebFetchPromptContext {
  mime_type: string;
  content_type: string;
  destination_url: string;
}

interface WebFetchKnowledge {
  type: 'knowledge';
  title: string;
  url: string;
  metadata: WebFetchMetadata;
  is_missing: boolean;
  text: string;
  is_citable: boolean;
  prompt_context_metadata: WebFetchPromptContext;
}

interface WebFetchDisplayContent {
  type: 'rich_link';
  link: {
    title: string;
    url: string;
    icon_url: string;
    source: string;
  };
  is_trusted: boolean;
}

interface WebFetchToolResult {
  type: 'tool_result';
  name: 'web_fetch';
  content: WebFetchKnowledge[];
  is_error: boolean;
  message: string;
  integration_name: string;
  integration_icon_url: string;
  display_content: WebFetchDisplayContent;
}

/* ============================
 * Unified content union
 * ============================ */

type ToolResultContent =
  | ArtifactToolResult
  | WebFetchToolResult;

type MessageContent =
  | TextContent
  | ToolUseContent
  | ToolResultContent;

/* ============================
 * Attachments / files
 * ============================ */

interface Attachment {
  id: string;
  file_name: string;
  file_type?: string;
  extracted_content?: unknown;
}

interface ChatFile {
  file_name: string;
  file_kind?: string;
}

/* ============================
 * Chat message
 * ============================ */

export interface ChatMessage {
  uuid: string;
  text: string;
  content: MessageContent[];
  sender: Sender;
  index: number;
  created_at: string;
  updated_at: string;
  truncated: boolean;
  parent_message_uuid: string;
  stop_reason?: string;
  nOptions?: number;
  selectedOption?: number;
  attachments: Attachment[];
  files: ChatFile[];
  files_v2: ChatFile[];
  sync_sources: unknown[];
}

/* ============================
 * Event wrapper
 * ============================ */

export interface FoundMessagesEvent {
  type: 'FOUND_CONVERSATION';
  conversation: unknown;
}
