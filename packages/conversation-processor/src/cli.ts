// @paladin/conversation-processor/cli.ts

import { watch } from "fs"
import { mkdir, readFile, stat, writeFile } from "fs/promises"
import { dirname, join } from "path"
import { parseArgs } from "util"
import { tempwrite } from "@paladin/utils/tempwrite"
import { runPipeline } from "./pipeline"
import type { ConversationData } from "./types"
import { createRunnableWatcher, mapProjectFilesToPaths, type RunnableExecutionResult } from "./runnable-watch"
import { extractHeader } from "./utils/extract-header"
import { resolvePath } from "./utils/path"

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    tempwrite: { type: "boolean", default: false },
  },
})

const WATCH_DIR = process.env.SCRATCH_DIR
const PROJECTS_DIR = process.env.PROJECTS_DIR
const useTempwrite = values.tempwrite

if (!WATCH_DIR) {
  console.error("SCRATCH_DIR is required")
  process.exit(1)
}

if (!PROJECTS_DIR) {
  console.error("PROJECTS_DIR is required")
  process.exit(1)
}

const runnableWatcher = createRunnableWatcher()

console.log(`watching ${WATCH_DIR}`)

async function waitForStable(path: string, { interval = 50, timeout = 2000 } = {}) {
  let lastSize = -1
  const start = Date.now()

  while (Date.now() - start < timeout) {
    try {
      const s = await stat(path)
      if (s.size > 0 && s.size === lastSize) return
      lastSize = s.size
    } catch { }

    await Bun.sleep(interval)
  }
}

async function handleIncomingFile(filepath: string): Promise<boolean> {
  if (!filepath.endsWith(".ts") && !filepath.endsWith(".md")) return false

  const content = await readFile(filepath, "utf-8")
  const header = extractHeader(content)
  if (!header) {
    console.log(`could not extract path header from ${filepath}`)
    return true
  }

  const resolved = resolvePath(header.rawPath, PROJECTS_DIR)
  if (!resolved) {
    console.log(`could not resolve path from header "${header.rawPath}"`)
    return true
  }

  await mkdir(dirname(resolved), { recursive: true })
  await writeFile(resolved, content, "utf-8")
  console.log(`wrote ${resolved}`)
  return true
}

watch(WATCH_DIR, async (event, filename) => {
  if (event !== "rename" || !filename) return
  if (filename.endsWith(".crdownload")) return
  const filepath = join(WATCH_DIR, filename)
  await waitForStable(filepath)

  console.log("Processing:", filename)

  try {
    const handled = await handleIncomingFile(filepath)
    if (handled) return

    if (!filename.endsWith(".json")) return

    const raw = await readFile(filepath, "utf-8")
    const conversation: ConversationData = JSON.parse(raw)

    const result = await runPipeline(conversation, {
      baseDir: PROJECTS_DIR,
    })

    if (!result) {
      console.log("no valid artifacts found")
      return
    }

    const changedPaths = mapProjectFilesToPaths(result.rootDir, result.files)
    const runnableResults = await runnableWatcher.processChangedFiles(
      changedPaths,
      result.rootDir,
    )

    printResult({ ...result, ...runnableResults })
  } catch (e) {
    console.log("ERROR", e)
  }
})

type CliResult = NonNullable<Awaited<ReturnType<typeof runPipeline>>> & RunnableExecutionResult

function printResult(result: CliResult) {
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

  if (result.mochiFiles.length) {
    log(`\n  mochi (${result.mochiFiles.length})`)
  }

  if (result.testResults.length) {
    log(`\n  test (${result.testFiles.length})`)
    for (const r of result.testResults) {
      const icon = r.exitCode === 0 ? "✓" : "✗"
      log(`    ${icon} ${r.cmd.join(" ")}`)
      if (r.stdout) log(`      ${r.stdout.trim()}`)
      if (r.exitCode !== 0 && r.stderr) log(`      ${r.stderr.trim()}`)
    }
  }

  if (result.demoResults.length) {
    log(`\n  demo (${result.demoFiles.length})`)
    for (const r of result.demoResults) {
      const icon = r.exitCode === 0 ? "✓" : "✗"
      log(`    ${icon} ${r.cmd.join(" ")}`)
      if (r.stdout) log(`      ${r.stdout.trim()}`)
      if (r.exitCode !== 0 && r.stderr) log(`      ${r.stderr.trim()}`)
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
