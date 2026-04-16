// src/processors/claude/utils/extract-user-text.ts

import type { Message } from "../../../types/claude"

const STRIP_BLOCKS = [
  /<files>[\s\S]*?<\/files>/g,
  /<top-level-instructions>[\s\S]*?<\/top-level-instructions>/g,
]

/**
 * Extract user message text from conversation, cleaned of embedded file/instruction blocks.
 * If `seenUuids` is provided, messages with those uuids are skipped.
 */
export function extractUserText(
  messages: Message[],
  seenUuids?: Set<string>,
): string {
  const parts: string[] = []

  for (const msg of messages) {
    if (msg.sender !== "human" && msg.sender !== "user") continue
    if (seenUuids && msg.uuid && seenUuids.has(msg.uuid)) continue

    const text = msg.content
      .map((b) => (b.type === "text" ? (b as any).text ?? "" : ""))
      .join("\n")

    const cleaned = STRIP_BLOCKS
      .reduce((acc, re) => acc.replace(re, ""), text)
      .trim()

    if (cleaned) parts.push(cleaned)
  }

  return parts.join("\n\n")
}

/**
 * Collect all user message uuids from a conversation.
 */
export function collectUserUuids(messages: Message[]): string[] {
  const uuids: string[] = []
  for (const msg of messages) {
    if (msg.sender !== "human" && msg.sender !== "user") continue
    if (msg.uuid) uuids.push(msg.uuid)
  }
  return uuids
}
