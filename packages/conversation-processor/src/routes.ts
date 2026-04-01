// @paladin/conversation-processor/routes.ts

import { watch, type FSWatcher } from "fs"
import { readFile, stat } from "fs/promises"
import { join } from "path"
import { Hono } from "hono"
import { createBunWebSocket } from "hono/bun"
import type { ServerWebSocket } from "bun"
import { runPipeline } from "./pipeline"
import { createProjectRegistry } from "./project-registry"
import {
  createRunnableWatcher,
  mapProjectFilesToPaths,
  type RunnableExecutionResult,
} from "./runnable-watch"
import type { ConversationData, ConversationRef, ProjectData } from "./types"

const { upgradeWebSocket, websocket } = createBunWebSocket<ServerWebSocket>()

const clients = new Set<ServerWebSocket>()
const runnableWatcher = createRunnableWatcher({ watchEnabled: true })

const WATCH_DIR = process.env.SCRATCH_DIR
const PROJECTS_DIR = process.env.PROJECTS_DIR

let watcher: FSWatcher | null = null

export type BroadcastPayload = ProjectData & RunnableExecutionResult & {
  conversationRefs: ConversationRef[]
}

export function broadcast(data: BroadcastPayload) {
  const payload = JSON.stringify(data)
  for (const ws of clients) {
    ws.send(payload)
  }
}

const app = new Hono()

app.get(
  "/ws",
  upgradeWebSocket(() => ({
    onOpen(_event, ws) {
      clients.add(ws.raw as ServerWebSocket)
    },
    onClose(_event, ws) {
      clients.delete(ws.raw as ServerWebSocket)
    },
  })),
)

app.post("/watch", async (c) => {
  const body = await c.req.json().catch(() => ({})) as { enabled?: boolean }

  if (typeof body.enabled !== "boolean") {
    return c.json({ ok: false, error: "enabled (boolean) is required" }, 400)
  }

  runnableWatcher.setWatching(body.enabled)

  return c.json({ ok: true, enabled: runnableWatcher.isWatching() })
})

app.get("/watch", (c) => {
  return c.json({ enabled: runnableWatcher.isWatching() })
})

app.get("/health", (c) => c.json({ ok: true }))

export function startConversationWatcher() {
  if (watcher || !WATCH_DIR || !PROJECTS_DIR) return

  watcher = watch(WATCH_DIR, async (event, filename) => {
    if (event !== "rename" || !filename) return
    if (!filename.endsWith(".json") || filename.endsWith(".crdownload")) return

    const filepath = join(WATCH_DIR, filename)

    try {
      await waitForStable(filepath)
      await processConversationFile(filepath)
    } catch (error) {
      console.error("conversation watcher error", error)
    }
  })
}

export function stopConversationWatcher() {
  watcher?.close()
  watcher = null
}

async function processConversationFile(filepath: string) {
  if (!PROJECTS_DIR) return

  const raw = await readFile(filepath, "utf-8")
  const conversation: ConversationData = JSON.parse(raw)

  const result = await runPipeline(conversation, {
    baseDir: PROJECTS_DIR,
  })

  if (!result) return

  const changedPaths = mapProjectFilesToPaths(result.rootDir, result.files)
  const runnableResults = await runnableWatcher.processChangedFiles(
    changedPaths,
    result.rootDir,
  )

  const conversationRefs = recordConversationRef(result.name, conversation, PROJECTS_DIR)

  broadcast({
    ...result,
    ...runnableResults,
    conversationRefs,
  })
}

function recordConversationRef(
  projectName: string,
  conversation: ConversationData,
  projectsDir: string,
): ConversationRef[] {
  const storageRoot = join(projectsDir, ".paladin")
  const registry = createProjectRegistry(storageRoot)

  registry.addRef(projectName, {
    id: conversation.id,
    url: conversation.url,
    title: conversation.title,
    updatedAt: conversation.updatedAt,
  })

  const refs = registry.getRefs(projectName)
  registry.close()

  return refs
}

async function waitForStable(path: string, { interval = 50, timeout = 2000 } = {}) {
  let lastSize = -1
  const start = Date.now()

  while (Date.now() - start < timeout) {
    try {
      const s = await stat(path)
      if (s.size > 0 && s.size === lastSize) return
      lastSize = s.size
    } catch {}

    await Bun.sleep(interval)
  }
}

startConversationWatcher()

export { app, websocket }
