// src/cli.ts

import { watch } from "node:fs"
import { stat, readFile } from "node:fs/promises"
import { join } from "node:path"
import { run } from "./processors/claude/run"
import { bus } from "./bus"
import type { RunResult } from "./services/codeRunner"

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

// ── Helpers ─────────────────────────────────────────────────

function shortPath(filepath: string): string {
  const parts = filepath.split("/")
  const idx = parts.findIndex((p) => p === "packages")
  if (idx >= 0 && idx + 1 < parts.length) {
    return parts.slice(idx + 1).join("/")
  }
  // fallback: last 3 segments
  return parts.slice(-3).join("/")
}

// ── Bus listeners ───────────────────────────────────────────

bus.on("filewatch:session", (session: ClaudeSessionData) => {
  console.log(`\n  project: ${session.project.name} ${session.project.new ? "(new)" : ""}`)
  console.log(`  dir: ${session.project.dir}`)
  console.log(`  files:`)
  for (const f of session.files) {
    console.log(`    ${shortPath(f)}`)
  }
  for (const pkg of session.packages) {
    if (!pkg.installedDependencies.length && !pkg.new) continue
    console.log(`  package: ${pkg.name} ${pkg.new ? "(new)" : ""}`)
    for (const dep of pkg.installedDependencies) {
      console.log(`    + ${dep.name}@${dep.version}`)
    }
  }
})

bus.on("filewatch:results", (results: RunResult[]) => {
  console.log(`  runs:`)
  for (const r of results) {
    const icon = r.success ? "✓" : "✗"
    console.log(`    ${icon} ${r.name} ${shortPath(r.file)}`)
  }
  console.log()
})

async function waitForStable(filepath: string, { interval = 100, timeout = 3000, checks = 3 } = {}) {
  const start = Date.now()
  let stableCount = 0
  let lastSize = -1
  let lastMtime = -1

  while (Date.now() - start < timeout) {
    try {
      const s = await stat(filepath)
      if (s.size > 0 && s.size === lastSize && s.mtimeMs === lastMtime) {
        stableCount++
        if (stableCount >= checks) return
      } else {
        stableCount = 0
        lastSize = s.size
        lastMtime = s.mtimeMs
      }
    } catch {
      stableCount = 0
    }

    await Bun.sleep(interval)
  }
}

// ── Watcher ─────────────────────────────────────────────────

console.log(`Started watch process: ${WATCH_DIR}`)

watch(WATCH_DIR, async (event, filename) => {
  if (event !== "rename" || !filename) return
  if (filename.startsWith(".") || filename.endsWith(".crdownload")) return
  if (!filename.endsWith(".json")) return

  const filepath = join(WATCH_DIR, filename)
  await waitForStable(filepath)

  console.log("processing:", filename)

  try {
    const raw = await readFile(filepath, "utf-8")
    const conversation: Conversation = JSON.parse(raw)

    const result = await run(conversation)

    if (!result) {
      console.log("no updates")
    }
  } catch (e) {
    console.error("ERROR", e)
  }
})
