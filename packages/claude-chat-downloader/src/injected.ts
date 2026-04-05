// @paladin/claude-chat-downloader/src/injected.ts

import type { ChatMessage, SnapshotNode } from "./types"

// ─────────────────────────────────────────────────────────────
// Conversation + output envelope
// ─────────────────────────────────────────────────────────────

interface Conversation {
    id: string
    title: string
    url: string
    createdAt: string
    updatedAt: string
    artifacts: Artifact[]
}

interface Artifact {
    id: string
    content: string
    updatedAt: string | null
}

interface FoundConversationEvent {
    type: "FOUND_CONVERSATION"
    conversation: Conversation
    messages: MessagesPayload
}

interface MessagesPayload {
    url: string
    title: string
    updatedAt: string
    messages: ChatMessage[]
}

// ─────────────────────────────────────────────────────────────
// Artifact reducer
// ─────────────────────────────────────────────────────────────

class ArtifactReducer {
    private artifacts = new Map<string, Artifact>()

    process(messages: ChatMessage[]): Artifact[] {
        for (const msg of messages) {
            if (msg.sender !== "assistant") continue

            for (const block of msg.content) {
                if (
                    block?.type !== "tool_use" ||
                    block?.name !== "artifacts" ||
                    !block?.input
                ) continue

                const { command, id, content, old_str, new_str } = block.input
                const timestamp = block.stop_timestamp ?? null

                if (command === "create" || command === "rewrite") {
                    this.artifacts.set(id, { id, content, updatedAt: timestamp })
                }

                if (command === "update") {
                    const current = this.artifacts.get(id)
                    if (!current) continue

                    let updated = current.content.replace(old_str, new_str)

                    if (updated === current.content) {
                        updated = current.content.replace(
                            old_str.trim(),
                            new_str.trim(),
                        )
                    }

                    if (updated !== current.content) {
                        this.artifacts.set(id, { id, content: updated, updatedAt: timestamp })
                    }
                }
            }
        }

        return [...this.artifacts.values()]
    }
}

// ─────────────────────────────────────────────────────────────
// DOM snapshot + message discovery
// ─────────────────────────────────────────────────────────────

async function snapshot(
    node: Node,
    depth = 0,
): Promise<SnapshotNode | null> {
    if (!node || depth > 100) return null

    const result: SnapshotNode = { props: {}, children: [] }

    for (const prop of Object.getOwnPropertyNames(node)) {
        try {
            const value = (node as any)[prop]
            if (value && typeof value === "object") {
                result.props[prop] = value
            }
        } catch { }
    }

    for (const child of Array.from(node.childNodes)) {
        const snap = await snapshot(child, depth + 1)
        if (snap) result.children.push(snap)
    }

    return result
}

function isMessage(obj: unknown): obj is ChatMessage {
    return (
        !!obj &&
        typeof obj === "object" &&
        "uuid" in obj &&
        "content" in obj &&
        Array.isArray((obj as ChatMessage).content) &&
        "sender" in obj
    )
}

function collectMessages(
    obj: unknown,
    out: Map<string, ChatMessage>,
): void {
    if (!obj || typeof obj !== "object") return

    if (isMessage(obj)) {
        out.set(obj.uuid, obj)
        return
    }

    const node = obj as SnapshotNode

    if (node.props) {
        Object.values(node.props).forEach(v => {
            if (v && typeof v === "object") {
                collectMessages(v, out)
            }
        })
    }

    if (Array.isArray(node.children)) {
        node.children.forEach(c => collectMessages(c, out))
    }
}

// ─────────────────────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────────────────────

async function findConversation(): Promise<FoundConversationEvent> {
    const dom = await snapshot(document.documentElement)
    const messageMap = new Map<string, ChatMessage>()

    collectMessages(dom, messageMap)
    const messages = [...messageMap.values()]

    if (messages.length === 0) {
        throw new Error("No chat messages found in DOM snapshot")
    }

    const first = messages[0]
    const last = messages[messages.length - 1]

    const urlMatch = window.location.pathname.match(/\/chat\/([a-f0-9-]+)/)
    const id = urlMatch?.[1] || first.uuid

    const titleEl = document.querySelector("div.truncate.font-base-bold")
    const title = titleEl?.textContent?.trim() || document.title

    const reducer = new ArtifactReducer()
    const artifacts = reducer.process(messages)

    const conversation: Conversation = {
        id,
        title,
        url: window.location.href,
        createdAt: first.created_at,
        updatedAt: last.created_at,
        artifacts,
    }

    const messagesPayload: MessagesPayload = {
        url: window.location.href,
        title,
        updatedAt: last.updated_at,
        messages,
    }

    const event: FoundConversationEvent = {
        type: "FOUND_CONVERSATION",
        conversation,
        messages: messagesPayload,
    }

    window.postMessage(event, "*")
    return event
}

findConversation()
