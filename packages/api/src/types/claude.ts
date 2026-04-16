export interface Conversation {
  url: string;
  title: string;
  updatedAt: string;
  messages: Message[];
}

export interface Message {
  uuid?: string;
  sender: "human" | "user" | "assistant";
  content: ContentBlock[];
}

export interface ContentBlock {
  type: string;
  text?: string;
  name?: string;
  input?: any;
  stop_timestamp?: string;
}

export interface FileEntry {
  path: string;
  content: string;
}

export interface ParseResult {
  files: FileEntry[];
}

export interface ConversationData {
  id: string;
  url: string;
  title: string;
  updatedAt: string;
}
