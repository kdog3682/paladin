import type { ChatMessage, SnapshotNode } from "./types"

// ─────────────────────────────────────────────────────────────
// Conversation + output envelope
// ─────────────────────────────────────────────────────────────

interface ConversationError {
    command: string
    artifactId: string
    title: string | null
}

interface Conversation {
    id: string
    name: string
    url: string
    created_at: string
    updated_at: string
    artifacts: Artifact[]
    errors: ConversationError[]
}

interface Artifact {
    id: string
    content: string
}

interface FoundConversationEvent {
    type: "FOUND_CONVERSATION"
    conversation: Conversation
    messages: ChatMessage[]
}

// ─────────────────────────────────────────────────────────────
// Artifact reducer (path-agnostic)
// ─────────────────────────────────────────────────────────────

class ArtifactReducer {
    private seenMessages = new Set<string>()
    private artifacts = new Map<string, Artifact>()

    process(messages: ChatMessage[]): {
        artifacts: Artifact[]
        errors: ConversationError[]
    } {
        const errors: ConversationError[] = []

        for (const msg of messages) {
            if (msg.sender !== "assistant") continue
            if (this.seenMessages.has(msg.uuid)) continue
            this.seenMessages.add(msg.uuid)

            for (const block of msg.content) {
                if (
                    block?.type !== "tool_use" ||
                    block?.name !== "artifacts" ||
                    !block?.input
                ) continue

                const { command, id, title, content, old_str, new_str } = block.input

                if (command === "create" || command === "rewrite") {
                    const prev = this.artifacts.get(id)
                    if (!prev || prev.content !== content) {
                        this.artifacts.set(id, { id, content })
                    }
                }

                if (command === "update") {
                    const current = this.artifacts.get(id)
                    if (!current) {
                        errors.push({ command, artifactId: id, title: title ?? null })
                        continue
                    }

                    let updated = current.content.replace(old_str, new_str)

                    if (updated === current.content) {
                        updated = current.content.replace(
                            old_str.trim(),
                            new_str.trim(),
                        )
                    }

                    if (updated !== current.content) {
                        this.artifacts.set(id, { id, content: updated })
                    }
                }
            }
        }

        return { artifacts: [...this.artifacts.values()], errors }
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
    seen = new WeakSet<object>(),
): void {
    if (!obj || typeof obj !== "object") return
    if (seen.has(obj as object)) return
    seen.add(obj as object)

    if (isMessage(obj)) {
        out.set(obj.uuid, obj)
        return
    }

    const node = obj as SnapshotNode

    if (node.props) {
        Object.values(node.props).forEach(v => {
            if (v && typeof v === "object") {
                collectMessages(v, out, seen)
            }
        })
    }

    if (Array.isArray(node.children)) {
        node.children.forEach(c => collectMessages(c, out, seen))
    }
}

// ─────────────────────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────────────────────

async function findConversation(): Promise<FoundConversationEvent> {
    const dom = await snapshot(document.documentElement)
    const messages = new Map<string, ChatMessage>()

    collectMessages(dom, messages)
    const allMessages = [...messages.values()]

    if (allMessages.length === 0) {
        throw new Error("No chat messages found in DOM snapshot")
    }

    const first = allMessages[0]
    const last = allMessages[allMessages.length - 1]

    const urlMatch = window.location.pathname.match(/\/chat\/([a-f0-9-]+)/)
    const uuid = urlMatch?.[1] || first.uuid

    const titleEl = document.querySelector("div.truncate.font-base-bold")
    const name = titleEl?.textContent?.trim() || document.title

    console.log('[scaffold] total messages found:', allMessages.length)
    const sampleContent = allMessages
        .filter(m => m.sender === 'assistant')
        .slice(0, 2)
        .map(m => ({ uuid: m.uuid, contentTypes: m.content.map((b: any) => `${b.type}:${b.name ?? ''}`) }))
    console.log('[scaffold] assistant message sample:', JSON.stringify(sampleContent, null, 2))

    const reducer = new ArtifactReducer()
    const { artifacts, errors } = reducer.process(allMessages)

    const conversation: Conversation = {
        id: uuid,
        name,
        url: window.location.href,
        created_at: first.created_at,
        updated_at: last.created_at,
        artifacts,
        errors,
    }

    const event: FoundConversationEvent = {
        type: "FOUND_CONVERSATION",
        conversation,
        messages: allMessages,
    }

    window.postMessage(event, "*")
    return event
}

// Execute immediately
findConversation()
