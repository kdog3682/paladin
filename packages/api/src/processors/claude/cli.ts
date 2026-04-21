// usage:
//   bun src/processors/claude/cli.ts                 # run most recent file in SCRATCH_DIR
//   bun src/processors/claude/cli.ts --watch         # watch SCRATCH_DIR and run on change
//   bun src/processors/claude/cli.ts --dry           # dry run (no git, no bootstrap)
//   bun src/processors/claude/cli.ts --watch --dry

import { watch } from "node:fs"
import { join } from "node:path"
import { parseArgs } from "node:util"
import {
  readFileSafe,
  waitForStable,
  getMostRecentFile,
} from "../../utils/fs"
import { run } from "./run"
import type { Conversation } from "../../types/claude"

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    watch: { type: "boolean", default: false },
    dry: { type: "boolean", default: false },
  },
  allowPositionals: true,
})

const dir = process.env.SCRATCH_DIR
if (!dir) {
  console.error("SCRATCH_DIR not set")
  process.exit(1)
}

const dryRun = values.dry ?? false

async function runFile(filepath: string) {
  await waitForStable(filepath)
  const conversation = (await readFileSafe(
    filepath,
  )) as Conversation | null
  if (!conversation) {
    console.log("no conversation at", filepath)
    return
  }
  console.log(`running ${filepath}${dryRun ? " (dry)" : ""}`)
  await run(conversation, { dryRun })
}

if (values.watch) {
  console.log(`watching ${dir}${dryRun ? " (dry)" : ""}`)
  watch(dir, async (event, filename) => {
    if (event !== "rename" || !filename) return
    if (filename.startsWith(".") || filename.endsWith(".crdownload"))
      return
    if (!filename.endsWith(".json")) return
    try {
      await runFile(join(dir, filename))
    } catch (e) {
      console.error("cli error:", e)
    }
  })
} else {
  const recent = await getMostRecentFile(dir, "json")
  if (!recent) {
    console.log("no files in", dir)
    process.exit(0)
  }
  await runFile(recent)
}
