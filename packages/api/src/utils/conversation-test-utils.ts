// helpers for constructing / writing Conversation JSON fixtures
// used to debug the filewatch -> run pipeline

import { join } from "node:path"
import { randomUUID } from "node:crypto"
import { writeFileSafe, readFileSafe } from "./fs"
import type {
  Conversation,
  Message,
  MessageContent,
  ArtifactInput,
} from "../types/claude"

// ── builders ─────────────────────────────────────────────

interface BuildOpts {
  url?: string
  title?: string
  userText?: string
  artifacts?: ArtifactInput[]
  assistantText?: string
}

export function buildConversation(
  opts: BuildOpts = {},
): Conversation {
  const {
    url = `https://claude.ai/chat/${randomUUID()}`,
    title = "test conversation",
    userText = "make a file",
    artifacts = [],
    assistantText = "",
  } = opts

  const now = new Date().toISOString()
  const userUuid = randomUUID()
  const asstUuid = randomUUID()

  const userMsg: Message = {
    uuid: userUuid,
    text: "",
    content: [
      {
        type: "text",
        text: userText,
        start_timestamp: now,
        stop_timestamp: now,
        citations: [],
      },
    ],
    sender: "human",
    index: 0,
    created_at: now,
    updated_at: now,
    truncated: false,
    attachments: [],
    files: [],
    sync_sources: [],
    parent_message_uuid: "00000000-0000-4000-8000-000000000000",
    nOptions: 1,
    selectedOption: 0,
  }

  const asstContent: MessageContent[] = []

  for (const art of artifacts) {
    const toolId = `toolu_${randomUUID().replace(/-/g, "").slice(0, 24)}`
    asstContent.push({
      type: "tool_use",
      id: toolId,
      name: "artifacts",
      input: {
        ...art,
        version_uuid: art.version_uuid ?? randomUUID(),
      },
      message: "artifacts",
      icon_name: "artifacts",
      start_timestamp: now,
      stop_timestamp: now,
    })
    asstContent.push({
      type: "tool_result",
      tool_use_id: toolId,
      name: "artifacts",
      content: [{ type: "text", text: "OK", uuid: randomUUID() }],
      is_error: false,
      icon_name: "artifacts",
    })
  }

  asstContent.push({
    type: "text",
    text: assistantText,
    start_timestamp: now,
    stop_timestamp: now,
    citations: [],
  })

  const asstMsg: Message = {
    uuid: asstUuid,
    text: "",
    content: asstContent,
    sender: "assistant",
    index: 1,
    created_at: now,
    updated_at: now,
    truncated: false,
    stop_reason: "stop_sequence",
    attachments: [],
    files: [],
    sync_sources: [],
    parent_message_uuid: userUuid,
    nOptions: 1,
    selectedOption: 0,
  }

  return { url, title, updatedAt: now, messages: [userMsg, asstMsg] }
}

// ── artifact helper ──────────────────────────────────────

interface ArtifactOpts {
  path: string
  content: string
  id?: string
  title?: string
  language?: string
}

export function makeArtifact({
  path,
  content,
  id,
  title,
  language = "typescript",
}: ArtifactOpts): ArtifactInput {
  const body = `// ${path}\n\n${content}`

  return {
    id: id ?? path.replace(/[^a-z0-9]/gi, "-").toLowerCase(),
    type: "application/vnd.ant.code",
    title: title ?? path.split("/").pop() ?? path,
    command: "create",
    content: body,
    language,
  }
}

// ── writing fixtures to scratch dir ──────────────────────

function scratchDir(): string {
  const dir = process.env.SCRATCH_DIR
  if (!dir) throw new Error("SCRATCH_DIR not set")
  return dir
}

function filenameFor(conv: Conversation): string {
  const slug = conv.url.split("/").pop() ?? randomUUID()
  return `${slug}.json`
}

export async function writeConversation(
  conv: Conversation,
): Promise<string> {
  const path = join(scratchDir(), filenameFor(conv))
  await writeFileSafe(path, conv)
  return path
}

// ── incrementing (to retrigger run) ──────────────────────

// run.ts skips files whose content hasn't changed (via fcache).
// incrementArtifact appends a tiny timestamp comment to the first
// artifact's content so fcache sees a new hash and re-writes.

export async function incrementArtifact(
  pathOrConv: string | Conversation,
): Promise<string> {
  const conv: Conversation =
    typeof pathOrConv === "string"
      ? ((await readFileSafe(pathOrConv)) as Conversation)
      : pathOrConv

  if (!conv) throw new Error(`could not read conversation`)

  const assistantMsg = conv.messages.find(
    (m) => m.sender === "assistant",
  )
  if (!assistantMsg) throw new Error("no assistant message")

  const toolUse = assistantMsg.content.find(
    (c) => c.type === "tool_use",
  )
  if (!toolUse || toolUse.type !== "tool_use")
    throw new Error("no artifact tool_use")

  const stampLine = `// incremented at ${new Date().toISOString()}\n`
  const existing = (toolUse.input.content as string) ?? ""
  toolUse.input.content = stampLine + existing
  toolUse.input.version_uuid = randomUUID()

  conv.updatedAt = new Date().toISOString()

  return writeConversation(conv)
}
