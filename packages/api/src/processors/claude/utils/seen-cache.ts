// src/processors/claude/utils/seen-cache.ts

import os from "node:os"
import path from "node:path"
import { readFileSafe, writeFileSafe } from "../../../utils/fs"

const CACHE_FILE = path.join(os.homedir(), ".paladin", "seen-messages.json")

type SeenStore = Record<string, string[]>

export async function getSeenUuids(conversationId: string): Promise<Set<string>> {
  const store = (await readFileSafe(CACHE_FILE)) as SeenStore | null
  return new Set(store?.[conversationId] ?? [])
}

export async function setSeenUuids(conversationId: string, uuids: string[]): Promise<void> {
  const store = ((await readFileSafe(CACHE_FILE)) as SeenStore | null) ?? {}
  store[conversationId] = uuids
  await writeFileSafe(CACHE_FILE, store)
}

/* instruct.refactor: save as .paladin/cache/conversations/<conv>/messageIds.json */