// src/processors/claude/run.ts

import { mkdir, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import { processConversation } from "./process"
import { bootstrapMonorepo } from "../../services/bootstrap/monorepo"
import { collectRunFiles, runFiles } from "../../services/codeRunner"
import { bus } from "../../bus"
import { config } from "../../config"
import type { Conversation, ClaudeSessionData } from "../../types/claude"

export async function run(conversation: Conversation): Promise<ClaudeSessionData | null> {
  const result = await processConversation(conversation, config.baseProjectsDir)
  if (!result) return null

  const { files, project } = result

  // 1. write files to disk
  for (const file of files) {
    await mkdir(dirname(file.path), { recursive: true })
    await writeFile(file.path, file.content)
  }

  const paths = files.map((f) => f.path)

  // 2. bootstrap monorepo (handles package.json, deps, bun install)
  const { packages } = await bootstrapMonorepo(project.dir, paths)

  // 3. emit session info
  const session: ClaudeSessionData = {
    project,
    conversation: {
      id: conversation.url,
      url: conversation.url,
      title: conversation.title,
      updatedAt: conversation.updatedAt,
    },
    files: paths,
    packages,
  }

  bus.emit("filewatch:session", session)

  // 4. run matched handlers (tests, demos, etc.)
  const toRun = collectRunFiles(files)

  if (toRun.length) {
    bus.emit("filewatch:pending", toRun)
    const results = await runFiles(toRun)
    bus.emit("filewatch:results", results)
  }

  return session
}
