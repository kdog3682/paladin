// src/run-cli-once.ts

import { readdir, readFile, stat } from "node:fs/promises"
import { join } from "node:path"
import { run } from "./processors/claude/run"

const SCRATCH_DIR = process.env.SCRATCH_DIR ?? join(process.env.HOME!, "scratch")

const files = await readdir(SCRATCH_DIR)
const jsonFiles = files.filter((f) => f.endsWith(".json") && !f.startsWith("."))

if (!jsonFiles.length) {
  console.error("No .json files found in", SCRATCH_DIR)
  process.exit(1)
}

const withMtime = await Promise.all(
  jsonFiles.map(async (f) => {
    const s = await stat(join(SCRATCH_DIR, f))
    return { file: f, mtime: s.mtimeMs }
  })
)

const latest = withMtime.sort((a, b) => b.mtime - a.mtime)[0].file
const filepath = join(SCRATCH_DIR, latest)

console.log("file:", latest)

const raw = await readFile(filepath, "utf-8")
const conversation: Conversation = JSON.parse(raw)

const result = await run(conversation)

if (!result) {
  console.log("no updates")
} else {
  console.log("result:", JSON.stringify(result, null, 2))
}
