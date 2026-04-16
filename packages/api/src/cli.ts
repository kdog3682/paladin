// src/cli.ts

import { watch } from "node:fs"
import { join } from "node:path"
import { readFileSafe, waitForStable } from "./utils/fs"
import { run } from "./processors/claude/run"
import { bus } from "./bus"
import type { Conversation } from "./types/claude"
import type { SessionData } from "./types/session"

const WATCH_DIR = process.env.SCRATCH_DIR
const PROJECTS_DIR = process.env.PROJECTS_DIR

if (!WATCH_DIR) {
  console.error("SCRATCH_DIR is required")
  process.exit(1)
}
if (!PROJECTS_DIR) {
  console.error("PROJECTS_DIR is required")
  process.exit(1)
}

function shortPath(filepath: string): string {
  const parts = filepath.split("/")
  const idx = parts.findIndex((p) => p === "packages")
  if (idx >= 0 && idx + 1 < parts.length) {
    return parts.slice(idx + 1).join("/")
  }
  return parts.slice(-3).join("/")
}

// Track state per conversation — first emit is partial, second is full
const seenPartial = new Set<string>()

bus.on("filewatch:session", (session: SessionData) => {
  const id = session.conversation.id

  if (!seenPartial.has(id)) {
    seenPartial.add(id)
    console.log(`\n  project: ${session.project.name}`)
    console.log(`  dir: ${session.project.dir}`)
    console.log(`  conversation: ${session.conversation.title}`)
    return
  }

  seenPartial.delete(id)

  console.log(`  branch: ${session.git.branch}`)
  if (session.git.files.length) {
    console.log(`  files:`)
    for (const f of session.git.files) {
      console.log(`    ${f.status === "created" ? "+" : "~"} ${shortPath(f.path)}`)
    }
  }
  if (session.git.commitMessage) {
    console.log(`  commit: ${session.git.commitMessage}`)
  }
  if (session.runResults.length) {
    console.log(`  runs:`)
    for (const r of session.runResults) {
      const icon = r.success ? "✓" : "✗"
      console.log(`    ${icon} ${r.name} ${shortPath(r.file)}`)
    }
  }
  console.log()
})

console.log(`Started watch process: ${WATCH_DIR}`)

watch(WATCH_DIR, async (event, filename) => {
  if (event !== "rename" || !filename) return
  if (filename.startsWith(".") || filename.endsWith(".crdownload")) return
  if (!filename.endsWith(".json")) return

  const filepath = join(WATCH_DIR, filename)
  await waitForStable(filepath)

  console.log("processing:", filename)

  try {
    const conversation = (await readFileSafe(filepath)) as Conversation | null
    if (!conversation) return

    const result = await run(conversation)
    if (!result) console.log("no updates")
  } catch (e) {
    console.error("ERROR", e)
  }
})
