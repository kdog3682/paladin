// @paladin/conversation-processor/cli.ts

import { watch } from "fs"
import { readFile } from "fs/promises"
import { join } from "path"
import { parseArgs } from "util"
import { mochi } from "@paladin/mochi"
import { tempwrite } from "@paladin/utils/tempwrite"
import { runPipeline } from "./pipeline"
import type { ConversationData, FileOp } from "./types"

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    tempwrite: { type: "boolean", default: false },
  },
})

const WATCH_DIR = process.env.SCRATCH_DIR
const useTempwrite = values.tempwrite

if (!WATCH_DIR) {
  console.error("SCRATCH_DIR is required")
  process.exit(1)
}

const mochiHandler = {
  name: "mochi",
  match: (op: FileOp) => op.kind === "write" && op.path.endsWith(".mochi.ts"),
  run: async (op: FileOp) => {
    if (op.kind !== "write") return null
    return mochi([op.path])
  },
}

console.log(`watching ${WATCH_DIR}`)

watch(WATCH_DIR, async (_event, filename) => {
  if (!filename?.endsWith(".json")) return

  const raw = await readFile(join(WATCH_DIR, filename), "utf-8")
  const conversation: ConversationData = JSON.parse(raw)

  const result = await runPipeline(conversation, {
    handlers: [mochiHandler],
  })

  if (!result) {
    console.log("no valid artifacts found")
    return
  }

  printResult(result)
})

function printResult(result: Awaited<ReturnType<typeof runPipeline>>) {
  if (!result) return

  const lines: string[] = []
  const log = (s = "") => lines.push(s)

  log(`\n${result.name} ${result.isNew ? "(new)" : ""}`)
  log(`  ${result.rootDir}\n`)

  const byPackage = new Map<string, string[]>()

  for (const file of result.files) {
    const parts = file.path.split("/")
    const pkg = parts.length > 2 ? `${parts[0]}/${parts[1]}` : "(root)"
    const rest = parts.length > 2 ? parts.slice(2).join("/") : file.path
    const label = file.status === "created" ? "+" : "~"

    if (!byPackage.has(pkg)) byPackage.set(pkg, [])
    byPackage.get(pkg)!.push(`  ${label} ${rest}`)
  }

  for (const [pkg, files] of byPackage) {
    log(`  ${pkg}`)
    for (const file of files) {
      log(`    ${file}`)
    }
  }

  if (result.bashResults.length) {
    log("\n  commands:")
    for (const r of result.bashResults) {
      const icon = r.exitCode === 0 ? "✓" : "✗"
      log(`    ${icon} ${r.cmd}`)
      if (r.stdout) log(`      ${r.stdout.trim()}`)
      if (r.exitCode !== 0 && r.stderr) log(`      ${r.stderr.trim()}`)
    }
  }

  for (const [name, results] of Object.entries(result.handlerResults)) {
    log(`\n  ${name}:`)
    for (const r of results) {
      log(`    ${JSON.stringify(r)}`)
    }
  }

  log("")

  const output = lines.join("\n")

  if (useTempwrite) {
    tempwrite(output)
  } else {
    console.log(output)
  }
}
