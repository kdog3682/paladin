// @paladin/packages/api/src/services/filewatch/watcher.ts

import { watch } from "fs"
import { readFile } from "fs/promises"
import { join } from "path"
import { config } from "../../config"
import { log } from "../../logger"
import { waitForStable } from "../../utils/fs"
import { processClaudeConversation } from "./process-claude-conversation"
import type { Conversation } from "./types"

let started = false

export function startWatcher(): void {
  if (started) return
  started = true

  watch(config.watchDir, async (event, filename) => {
    if (event !== "rename" || !filename) return
    if (filename.endsWith(".crdownload")) return
    if (!filename.endsWith(".json")) return
    if (!filename.startsWith("claude.conversation.messages")) return

    const filepath = join(config.watchDir, filename)
    await waitForStable(filepath)

    try {
      const raw = await readFile(filepath, "utf-8")
      const conversation: Conversation = JSON.parse(raw)
      await processClaudeConversation(conversation)
    } catch (err) {
      log.error(`failed to process ${filename}:`, err)
    }
  })
}
